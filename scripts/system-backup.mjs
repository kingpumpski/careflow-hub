import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const projectRef = process.env.SUPABASE_PROJECT_ID;
const expectedRef = "jajfdgknctzqypdtvmxo";
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const managementToken = process.env.SUPABASE_ACCESS_TOKEN;
const ageRecipient = process.env.BACKUP_AGE_RECIPIENT;
const r2Endpoint = process.env.BACKUP_R2_ENDPOINT;
const r2Bucket = process.env.BACKUP_R2_BUCKET;
const r2Account = process.env.BACKUP_R2_ACCOUNT_ID;
const commit = process.env.GITHUB_SHA ?? "unknown";

for (const [name, value] of Object.entries({
  SUPABASE_PROJECT_ID: projectRef,
  SUPABASE_URL: supabaseUrl,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  SUPABASE_ACCESS_TOKEN: managementToken,
  BACKUP_AGE_RECIPIENT: ageRecipient,
  BACKUP_R2_ENDPOINT: r2Endpoint,
  BACKUP_R2_BUCKET: r2Bucket,
  BACKUP_R2_ACCOUNT_ID: r2Account,
})) if (!value) throw new Error("Missing required secret/configuration: " + name);
if (projectRef !== expectedRef || !supabaseUrl.includes(projectRef + ".supabase.co")) {
  throw new Error("Refusing backup: SUPABASE_PROJECT_ID and SUPABASE_URL must identify the approved CareFlow project.");
}
if (!ageRecipient.startsWith("age1")) throw new Error("BACKUP_AGE_RECIPIENT must be a valid age public recipient.");
if (!r2Endpoint.startsWith("https://")) throw new Error("BACKUP_R2_ENDPOINT must use HTTPS.");

const backupId = new Date().toISOString().replace(/[-:.]/g, "").replace("Z", "") + "-" + randomUUID().slice(0, 8);
const root = await mkdtemp(path.join(tmpdir(), "careflow-backup-"));
const stage = path.join(root, "package");
const storageRoot = path.join(stage, "storage", "objects");
await mkdir(storageRoot, { recursive: true });

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function downloadDatabaseBackup() {
  const response = await fetch("https://api.supabase.com/v2/projects/" + projectRef + "/backups/download", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + managementToken,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ data: { type: "project_backup_file" } }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error("Supabase database backup request failed (" + response.status + "): " + text.slice(0, 1200));
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error("Supabase backup API did not return JSON."); }
  const fileUrl = payload?.data?.attributes?.file_url ?? payload?.data?.file_url ?? payload?.file_url;
  if (typeof fileUrl !== "string" || !/^https:\/\//.test(fileUrl)) {
    throw new Error("Supabase backup API did not return a valid HTTPS file_url. Refusing to create an incomplete backup.");
  }
  const fileResponse = await fetch(fileUrl);
  if (!fileResponse.ok || !fileResponse.body) throw new Error("Unable to download the generated database backup: HTTP " + fileResponse.status);
  const contentDisposition = fileResponse.headers.get("content-disposition") ?? "";
  const extension = contentDisposition.match(/filename="?([^";]+)"?/i)?.[1]?.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "backup";
  const target = path.join(stage, "database", "project-database." + (extension || "backup"));
  await mkdir(path.dirname(target), { recursive: true });
  await pipeline(Readable.fromWeb(fileResponse.body), createWriteStream(target, { flags: "wx" }));
  const info = await stat(target);
  if (info.size < 1024) throw new Error("Downloaded database backup is unexpectedly small; refusing to publish.");
  return { path: path.relative(stage, target), bytes: info.size, sha256: await sha256File(target), contentType: fileResponse.headers.get("content-type") ?? "application/octet-stream" };
}

async function storageRequest(route, options = {}) {
  return fetch(supabaseUrl + "/storage/v1" + route, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: "Bearer " + serviceKey,
      ...(options.headers ?? {}),
    },
  });
}

async function exportStorage() {
  const bucketsResponse = await storageRequest("/bucket");
  if (!bucketsResponse.ok) throw new Error("Unable to list Storage buckets: HTTP " + bucketsResponse.status);
  const buckets = await bucketsResponse.json();
  if (!Array.isArray(buckets)) throw new Error("Storage bucket response was not an array.");
  const bucketManifests = [];
  let objectCount = 0;
  let totalBytes = 0;

  for (const bucket of buckets) {
    const bucketName = String(bucket.name ?? bucket.id ?? "");
    if (!bucketName || bucketName.includes("/") || bucketName.includes("..")) throw new Error("Invalid Storage bucket name returned by API.");
    const bucketDir = path.join(storageRoot, bucketName);
    await mkdir(bucketDir, { recursive: true });
    const objects = [];
    const queue = [""];
    const visited = new Set();

    while (queue.length) {
      const prefix = queue.shift();
      if (visited.has(prefix)) continue;
      visited.add(prefix);
      let offset = 0;
      while (true) {
        const listResponse = await storageRequest("/object/list/" + encodeURIComponent(bucketName), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
        });
        if (!listResponse.ok) throw new Error("Unable to list Storage objects for bucket " + bucketName + " (HTTP " + listResponse.status + ").");
        const entries = await listResponse.json();
        if (!Array.isArray(entries)) throw new Error("Unexpected Storage listing response for bucket " + bucketName + ".");
        for (const entry of entries) {
          const name = String(entry.name ?? "");
          if (!name || name === "." || name === ".." || name.includes("\\") || name.startsWith("/")) throw new Error("Unsafe Storage object name encountered.");
          const key = prefix ? prefix + "/" + name : name;
          const isFolder = entry.id == null && entry.metadata == null;
          if (isFolder) {
            queue.push(key);
            continue;
          }
          const relative = path.join(bucketName, ...key.split("/"));
          const target = path.join(bucketDir, ...key.split("/"));
          if (!target.startsWith(bucketDir + path.sep)) throw new Error("Storage path escaped backup directory.");
          await mkdir(path.dirname(target), { recursive: true });
          const encodedKey = key.split("/").map(encodeURIComponent).join("/");
          const objectResponse = await storageRequest("/object/authenticated/" + encodeURIComponent(bucketName) + "/" + encodedKey);
          if (!objectResponse.ok || !objectResponse.body) throw new Error("Unable to download Storage object " + bucketName + "/" + key + " (HTTP " + objectResponse.status + ").");
          await pipeline(Readable.fromWeb(objectResponse.body), createWriteStream(target, { flags: "wx" }));
          const objectStat = await stat(target);
          const object = {
            key,
            path: path.posix.join("storage", "objects", relative.split(path.sep).join("/")),
            bytes: objectStat.size,
            sha256: await sha256File(target),
            content_type: entry.metadata?.mimetype ?? entry.metadata?.contentType ?? "application/octet-stream",
            cache_control: entry.metadata?.cacheControl ?? null,
            metadata: entry.user_metadata ?? null,
          };
          objects.push(object);
          objectCount += 1;
          totalBytes += objectStat.size;
        }
        if (entries.length < 1000) break;
        offset += entries.length;
      }
    }
    bucketManifests.push({
      name: bucketName,
      public: Boolean(bucket.public),
      file_size_limit: bucket.file_size_limit ?? null,
      allowed_mime_types: bucket.allowed_mime_types ?? null,
      object_count: objects.length,
      objects,
    });
  }
  await mkdir(path.join(stage, "storage"), { recursive: true });
  await writeFile(path.join(stage, "storage", "manifest.json"), JSON.stringify({ buckets: bucketManifests }, null, 2));
  return { bucketCount: buckets.length, objectCount, totalBytes };
}

async function writeSourceSnapshot() {
  const target = path.join(stage, "source");
  await mkdir(target, { recursive: true });
  const archivePath = path.join(target, "careflow-source.tar");
  await exec("git", ["archive", "--format=tar", "--output", archivePath, "HEAD"], { cwd: process.cwd() });
  const info = await stat(archivePath);
  return {
    commit,
    archive_path: "source/careflow-source.tar",
    archive_bytes: info.size,
    archive_sha256: await sha256File(archivePath),
    included: ["supabase/config.toml", "supabase/migrations", "supabase/functions", "application source at the recorded commit"],
  };
}

try {
  console.log("Creating CareFlow full-system backup " + backupId + " for " + projectRef);
  const database = await downloadDatabaseBackup();
  console.log("Database backup downloaded: " + database.bytes + " bytes.");
  const storage = await exportStorage();
  console.log("Storage export complete: " + storage.bucketCount + " buckets, " + storage.objectCount + " objects.");
  const source = await writeSourceSnapshot();

  const innerManifest = {
    format: "careflow-system-backup",
    format_version: 1,
    backup_id: backupId,
    created_at: new Date().toISOString(),
    project_ref: projectRef,
    source,
    database,
    storage,
    security: {
      archive_encrypted_with_age: true,
      secrets_included: false,
      auth_and_database_users: "Included only to the extent provided by the Supabase platform database backup file; verify with a restore test.",
      supabase_storage_files: "Separately exported from every bucket.",
    },
  };
  await writeFile(path.join(stage, "manifest.json"), JSON.stringify(innerManifest, null, 2));
  const archive = path.join(root, "careflow-system-backup.tar.gz");
  await exec("tar", ["-czf", archive, "-C", stage, "."]);
  const encrypted = archive + ".age";
  await exec("age", ["-r", ageRecipient, "-o", encrypted, archive]);
  const encryptedInfo = await stat(encrypted);
  const encryptedSha = await sha256File(encrypted);
  const backupKey = "backups/" + projectRef + "/" + backupId + ".tar.gz.age";
  const manifestKey = "manifests/" + projectRef + "/" + backupId + ".json";
  const publicManifest = {
    format: "careflow-system-backup",
    format_version: 1,
    backup_id: backupId,
    created_at: innerManifest.created_at,
    project_ref: projectRef,
    source_commit: commit,
    encrypted_object_key: backupKey,
    encrypted_bytes: encryptedInfo.size,
    encrypted_sha256: encryptedSha,
    database_bytes: database.bytes,
    storage_bucket_count: storage.bucketCount,
    storage_object_count: storage.objectCount,
    storage_bytes: storage.totalBytes,
    verification: "upload-pending",
    secrets_included: false,
  };
  const encryptedPath = "s3://" + r2Bucket + "/" + backupKey;
  const manifestPath = "s3://" + r2Bucket + "/" + manifestKey;
  const aws = ["--endpoint-url", r2Endpoint, "--region", "auto"];
  await exec("aws", ["s3", "cp", encrypted, encryptedPath, ...aws, "--only-show-errors"]);
  // AWS CLI head-object uses SigV4; do not treat an unsigned HTTP HEAD as proof.
  const headResult = await exec("aws", ["s3api", "head-object", "--bucket", r2Bucket, "--key", backupKey, ...aws]);
  const parsedHead = JSON.parse(headResult.stdout || "{}");
  if (Number(parsedHead.ContentLength) !== encryptedInfo.size) throw new Error("R2 object size verification failed.");
  const verificationCopy = path.join(root, "verify.age");
  await exec("aws", ["s3", "cp", encryptedPath, verificationCopy, ...aws, "--only-show-errors"]);
  if (await sha256File(verificationCopy) !== encryptedSha) throw new Error("R2 download checksum did not match the generated backup.");
  publicManifest.verification = "sha256-verified";
  const manifestFile = path.join(root, "public-manifest.json");
  await writeFile(manifestFile, JSON.stringify(publicManifest, null, 2));
  await exec("aws", ["s3", "cp", manifestFile, manifestPath, ...aws, "--content-type", "application/json", "--cache-control", "no-store", "--only-show-errors"]);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, "backup_id=" + backupId + "\\n");
  console.log(JSON.stringify({ backup_id: backupId, encrypted_bytes: encryptedInfo.size, storage_objects: storage.objectCount, verification: publicManifest.verification, manifest_key: manifestKey }));
} finally {
  await rm(root, { recursive: true, force: true });
}
