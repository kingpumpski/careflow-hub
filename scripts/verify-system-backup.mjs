import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("Usage: node scripts/verify-system-backup.mjs <extracted-backup-directory>");
const manifestPath = path.join(root, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.format !== "careflow-system-backup" || manifest.format_version !== 1) throw new Error("Unsupported CareFlow backup format.");
if (!/^[a-z0-9]{20,40}$/.test(manifest.project_ref ?? "")) throw new Error("Invalid project reference in backup manifest.");
if (!manifest.database?.path || !/^[a-f0-9]{64}$/.test(manifest.database.sha256 ?? "")) throw new Error("Database backup metadata is incomplete.");

async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
function safePath(relative) {
  if (typeof relative !== "string" || path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..")) throw new Error("Unsafe path in backup manifest.");
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(root + path.sep)) throw new Error("Manifest path escapes backup root.");
  return resolved;
}
const dbPath = safePath(manifest.database.path);
const dbStat = await stat(dbPath);
if (dbStat.size !== manifest.database.bytes || await sha256(dbPath) !== manifest.database.sha256) throw new Error("Database backup checksum/size validation failed.");

const storageManifest = JSON.parse(await readFile(path.join(root, "storage", "manifest.json"), "utf8"));
if (!Array.isArray(storageManifest.buckets)) throw new Error("Storage manifest is invalid.");
let objects = 0;
for (const bucket of storageManifest.buckets) {
  if (!bucket.name || !Array.isArray(bucket.objects)) throw new Error("Invalid Storage bucket manifest.");
  for (const object of bucket.objects) {
    const objectPath = safePath(object.path);
    const info = await stat(objectPath);
    if (info.size !== object.bytes || await sha256(objectPath) !== object.sha256) throw new Error("Storage object integrity failed: " + bucket.name + "/" + object.key);
    objects += 1;
  }
}
if (objects !== manifest.storage?.objectCount) throw new Error("Storage object count does not match the package manifest.");
console.log(JSON.stringify({
  status: "verified",
  project_ref: manifest.project_ref,
  backup_id: manifest.backup_id,
  created_at: manifest.created_at,
  database_bytes: dbStat.size,
  storage_buckets: storageManifest.buckets.length,
  storage_objects: objects,
  source_commit: manifest.source?.commit,
}, null, 2));
