import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

const root = process.argv[2] ? await realpath(path.resolve(process.argv[2])) : "";
if (!process.argv[2]) throw new Error("Usage: node scripts/verify-system-backup.mjs <extracted-backup-directory>");
const manifestPath = path.join(root, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.format !== "careflow-system-backup" || manifest.format_version !== 1) throw new Error("Unsupported CareFlow backup format.");
if (manifest.project_ref !== "jajfdgknctzqypdtvmxo") throw new Error("Backup project reference does not match CareFlow production.");
if (!/^[0-9T-]{8,30}-[0-9a-f-]{8,40}$/.test(manifest.backup_id ?? "")) throw new Error("Invalid backup ID in manifest.");
if (!manifest.database?.path || !/^[a-f0-9]{64}$/.test(manifest.database.sha256 ?? "")) throw new Error("Database backup metadata is incomplete.");
if (manifest.database.format !== "pg_dump_custom" || !Number.isInteger(manifest.database.postgresMajor)) throw new Error("Database backup is not a supported custom-format PostgreSQL dump.");

async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
async function safePath(relative) {
  if (typeof relative !== "string" || path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..")) throw new Error("Unsafe path in backup manifest.");
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(root + path.sep)) throw new Error("Manifest path escapes backup root.");
  const actual = await realpath(resolved);
  if (!actual.startsWith(root + path.sep)) throw new Error("Manifest path resolves outside backup root.");
  return actual;
}
const dbPath = await safePath(manifest.database.path);
const dbStat = await stat(dbPath);
if (dbStat.size !== manifest.database.bytes || await sha256(dbPath) !== manifest.database.sha256) throw new Error("Database backup checksum/size validation failed.");

const sourcePath = await safePath(manifest.source?.archive_path);
const sourceInfo = await stat(sourcePath);
if (sourceInfo.size !== manifest.source?.archive_bytes || await sha256(sourcePath) !== manifest.source?.archive_sha256) {
  throw new Error("Source snapshot checksum/size validation failed.");
}

const storageManifest = JSON.parse(await readFile(path.join(root, "storage", "manifest.json"), "utf8"));
if (!Array.isArray(storageManifest.buckets)) throw new Error("Storage manifest is invalid.");
if (storageManifest.buckets.length !== manifest.storage?.bucketCount) throw new Error("Storage bucket count does not match the package manifest.");
if (storageManifest.buckets.filter((bucket) => bucket.public).length !== manifest.storage?.publicBucketCount) throw new Error("Public Storage bucket count does not match the package manifest.");
let objects = 0;
let storageBytes = 0;
const bucketNames = new Set();
for (const bucket of storageManifest.buckets) {
  if (!bucket.name || bucketNames.has(bucket.name) || !Array.isArray(bucket.objects)) throw new Error("Invalid or duplicate Storage bucket manifest.");
  bucketNames.add(bucket.name);
  let bucketObjects = 0;
  for (const object of bucket.objects) {
    const objectPath = await safePath(object.path);
    const info = await stat(objectPath);
    if (info.size !== object.bytes || await sha256(objectPath) !== object.sha256) throw new Error("Storage object integrity failed: " + bucket.name + "/" + object.key);
    objects += 1;
    bucketObjects += 1;
    storageBytes += info.size;
  }
  if (bucketObjects !== bucket.object_count) throw new Error("Storage object count does not match bucket manifest: " + bucket.name);
}
if (objects !== manifest.storage?.objectCount) throw new Error("Storage object count does not match the package manifest.");
if (storageBytes !== manifest.storage?.totalBytes) throw new Error("Storage byte count does not match the package manifest.");
console.log(JSON.stringify({
  status: "verified",
  project_ref: manifest.project_ref,
  backup_id: manifest.backup_id,
  created_at: manifest.created_at,
  database_bytes: dbStat.size,
  storage_buckets: storageManifest.buckets.length,
  source_snapshot_bytes: sourceInfo.size,
  storage_objects: objects,
  storage_bytes: storageBytes,
  source_commit: manifest.source?.commit,
}, null, 2));
