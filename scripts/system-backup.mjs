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
const databaseUrl = process.env.SUPABASE_DB_URL;
const ageRecipient = process.env.BACKUP_AGE_RECIPIENT;
const r2Endpoint = process.env.BACKUP_R2_ENDPOINT;
const r2Bucket = process.env.BACKUP_R2_BUCKET;
const r2Account = process.env.BACKUP_R2_ACCOUNT_ID;
const commit = process.env.GITHUB_SHA ?? "unknown";

for (const [name, value] of Object.entries({
  SUPABASE_PROJECT_ID: projectRef,
  SUPABASE_URL: supabaseUrl,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  SUPABASE_DB_URL: databaseUrl,
  BACKUP_AGE_RECIPIENT: ageRecipient,
  BACKUP_R2_ENDPOINT: r2Endpoint,
  BACKUP_R2_BUCKET: r2Bucket,
  BACKUP_R2_ACCOUNT_ID: r2Account,
})) if (!value) throw new Error("Missing required secret/configuration: " + name);
if (projectRef !== expectedRef || !supabaseUrl.includes(projectRef + ".supabase.co")) {
  throw new Error("Refusing backup: SUPABASE_PROJECT_ID and SUPABASE_URL must identify the approved CareFlow project.");
}
if (!ageRecipient.startsWith("age1")) throw new Error("BACKUP_AGE_RECIPIENT must be a valid age public recipient.");
if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) throw new Error("SUPABASE_DB_URL must be a PostgreSQL connection URI.");
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
  const versionProbe = await exec("docker", [
    "run", "--rm", "-e", "DATABASE_URL", "postgres:19-alpine",
    "sh", "-c", 'psql "$DATABASE_URL" -Atqc "SHOW server_version_num"',
  ], { env: { ...process.env, DATABASE_URL: databaseUrl } });
  const serverVersionNum = Number(versionProbe.stdout.trim());
  const postgresMajor = Math.floor(serverVersionNum / 10000);
  if (!Number.isInteger(postgresMajor) || postgresMajor < 14 || postgresMajor > 19) {
    throw new Error("Unsupported PostgreSQL server version number: " + versionProbe.stdout.trim());
  }

  const databaseDir = path.join(stage, "database");
  await mkdir(databaseDir, { recursive: true });
  const target = path.join(databaseDir, "project-database.dump");
  await exec("docker", [
    "run", "--rm", "-v", databaseDir + ":/backup",
    "postgres:" + postgresMajor + "-alpine",
    "pg_dump", "--dbname", databaseUrl, "--format=custom", "--no-owner",
    "--file", "/backup/project-database.dump",
  ]);
  const info = await stat(target);
  if (info.size < 1024) throw new Error("Database dump is unexpectedly small; refusing to publish.");

  const toc = await exec("docker", [
    "run", "--rm", "-v", databaseDir + ":/backup",
    "postgres:" + postgresMajor + "-alpine",
    "pg_restore", "--list", "/backup/project-database.dump",
  ]);
  const requiredTables = [
    ["auth", "users"],
    ["auth", "identities"],
    ["storage", "buckets"],
    ["storage", "objects"],
    ["supabase_migrations", "schema_migrations"],
  ];
  for (const [schema, table] of requiredTables) {
    const pattern = new RegExp("\\bTABLE\\s+" + schema + "\\s+" + table + "\\b");
    if (!pattern.test(toc.stdout)) throw new Error("Database dump is missing required managed table " + schema + "." + table + ". Refusing to publish an incomplete backup.");
  }
  return {
    path: path.relative(stage, target),
    bytes: info.size,
    sha256: await sha256File(target),
    format: "pg_dump_custom",
    postgresMajor,
    includedSchemas: ["public", "auth", "storage", "supabase_migrations", "extensions"],
  };
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
      external_secrets_included: false,
      database_resident_credentials_included: true,
      auth_and_database_users: "Included from auth.users and auth.identities in the full PostgreSQL logical dump; encrypted password hashes are included and therefore the archive is highly confidential.",
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
    postgres_major: database.postgresMajor,
    database_format: database.format,
    storage_bucket_count: storage.bucketCount,
    storage_object_count: storage.objectCount,
    storage_bytes: storage.totalBytes,
    verification: "upload-pending",
    external_secrets_included: false,
    database_resident_credentials_included: true,
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
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, "backup_id=" + backupId + "\n");
  console.log(JSON.stringify({ backup_id: backupId, encrypted_bytes: encryptedInfo.size, storage_objects: storage.objectCount, verification: publicManifest.verification, manifest_key: manifestKey }));
} finally {
  await rm(root, { recursive: true, force: true });
}
