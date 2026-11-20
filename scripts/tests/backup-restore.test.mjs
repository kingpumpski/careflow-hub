import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const script = path.resolve("scripts/verify-system-backup.mjs");
const hash = (value) => createHash("sha256").update(value).digest("hex");

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "careflow-verify-test-"));
  await mkdir(path.join(root, "database"), { recursive: true });
  await mkdir(path.join(root, "storage", "objects", "claims"), { recursive: true });
  const db = Buffer.from("verified-database-backup-fixture");
  const object = Buffer.from("verified-storage-object-fixture");
  await writeFile(path.join(root, "database", "project-database.backup"), db);
  await writeFile(path.join(root, "storage", "objects", "claims", "sample.bin"), object);
  await writeFile(path.join(root, "storage", "manifest.json"), JSON.stringify({
    buckets: [{
      name: "claims",
      objects: [{
        key: "sample.bin",
        path: "storage/objects/claims/sample.bin",
        bytes: object.length,
        sha256: hash(object),
      }],
    }],
  }));
  await writeFile(path.join(root, "manifest.json"), JSON.stringify({
    format: "careflow-system-backup",
    format_version: 1,
    project_ref: "jajfdgknctzqypdtvmxo",
    backup_id: "20261120T010203040506-12345678",
    created_at: "2026-11-20T01:02:03.000Z",
    database: {
      path: "database/project-database.backup",
      bytes: db.length,
      sha256: hash(db),
    },
    storage: { objectCount: 1 },
    source: { commit: "test-commit" },
  }));
  return root;
}

test("verifies a complete database and Storage fixture", async () => {
  const root = await fixture();
  try {
    const result = spawnSync(process.execPath, [script, root], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /"status": "verified"/);
    assert.match(result.stdout, /"storage_objects": 1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a database checksum mismatch", async () => {
  const root = await fixture();
  try {
    await writeFile(path.join(root, "database", "project-database.backup"), "tampered");
    const result = spawnSync(process.execPath, [script, root], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Database backup checksum\/size validation failed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects Storage object path traversal", async () => {
  const root = await fixture();
  try {
    const manifestPath = path.join(root, "storage", "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.buckets[0].objects[0].path = "../../outside.bin";
    await writeFile(manifestPath, JSON.stringify(manifest));
    const result = spawnSync(process.execPath, [script, root], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unsafe path in backup manifest/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
