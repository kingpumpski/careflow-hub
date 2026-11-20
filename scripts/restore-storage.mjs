import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

const root = path.resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("Usage: node scripts/restore-storage.mjs <verified-extracted-backup-directory>");
const targetUrl = process.env.RESTORE_TARGET_SUPABASE_URL?.replace(/\/+$/, "");
const targetRef = process.env.RESTORE_TARGET_PROJECT_REF;
const serviceKey = process.env.RESTORE_TARGET_SERVICE_ROLE_KEY;
const confirmation = process.env.RESTORE_CONFIRMATION;
if (!targetUrl || !targetRef || !serviceKey) throw new Error("Set RESTORE_TARGET_SUPABASE_URL, RESTORE_TARGET_PROJECT_REF and RESTORE_TARGET_SERVICE_ROLE_KEY.");
if (new URL(targetUrl).hostname !== targetRef + ".supabase.co") throw new Error("Target URL and target project reference do not match.");
if (confirmation !== "RESTORE-STORAGE-TO:" + targetRef) throw new Error("Explicit restore confirmation does not match the target project.");
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
if (manifest.format !== "careflow-system-backup") throw new Error("Unsupported backup archive.");
const storage = JSON.parse(await readFile(path.join(root, "storage", "manifest.json"), "utf8"));
const headers = { apikey: serviceKey, Authorization: "Bearer " + serviceKey };
async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
async function api(route, options = {}) {
  const response = await fetch(targetUrl + "/storage/v1" + route, { ...options, headers: { ...headers, ...(options.headers ?? {}) } });
  if (!response.ok) throw new Error("Storage restore API failed: HTTP " + response.status + " for " + route + " — " + (await response.text()).slice(0, 400));
  return response;
}
const existingResponse = await api("/bucket");
const existing = await existingResponse.json();
const existingNames = new Set(existing.map((bucket) => bucket.name));
let restored = 0;
for (const bucket of storage.buckets) {
  if (!existingNames.has(bucket.name)) {
    await api("/bucket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: bucket.name,
        name: bucket.name,
        public: bucket.public,
        file_size_limit: bucket.file_size_limit,
        allowed_mime_types: bucket.allowed_mime_types,
      }),
    });
  }
  for (const object of bucket.objects) {
    const file = path.resolve(root, object.path);
    if (!file.startsWith(root + path.sep) || await sha256(file) !== object.sha256) throw new Error("Local object checksum failed: " + bucket.name + "/" + object.key);
    const encodedKey = object.key.split("/").map(encodeURIComponent).join("/");
    await api("/object/" + encodeURIComponent(bucket.name) + "/" + encodedKey, {
      method: "POST",
      headers: {
        "Content-Type": object.content_type || "application/octet-stream",
        "x-upsert": "true",
        ...(object.cache_control ? { "cache-control": object.cache_control } : {}),
      },
      body: createReadStream(file),
      duplex: "half",
    });
    const verify = await api("/object/authenticated/" + encodeURIComponent(bucket.name) + "/" + encodedKey);
    const hash = createHash("sha256");
    for await (const chunk of Readable.fromWeb(verify.body)) hash.update(chunk);
    if (hash.digest("hex") !== object.sha256) throw new Error("Uploaded object checksum mismatch: " + bucket.name + "/" + object.key);
    restored += 1;
  }
}
console.log(JSON.stringify({ status: "storage-restored-and-verified", target_project_ref: targetRef, buckets: storage.buckets.length, objects: restored }, null, 2));
