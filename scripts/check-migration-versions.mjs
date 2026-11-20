import { readdir } from "node:fs/promises";
import { join } from "node:path";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const allowedLegacyCollisions = new Map([
  ["20260907140000", [
    "20260907140000_preauth_atomic_hardening.sql",
    "20260907140000_preauth_versions_workflow_hardening.sql",
  ]],
  ["20260907144000", [
    "20260907144000_preauth_document_integrity.sql",
    "20260907144000_preauth_document_lifecycle.sql",
  ]],
  ["20260907145000", [
    "20260907145000_preauth_audit_events.sql",
    "20260907145000_preauth_workflow_transitions.sql",
  ]],
]);

const entries = (await readdir(migrationsDir))
  .filter((name) => name.endsWith(".sql"))
  .sort();

const versions = new Map();
const invalid = [];

for (const name of entries) {
  const match = /^(\d{14})_(.+)\.sql$/.exec(name);
  if (!match) {
    invalid.push(name);
    continue;
  }
  const group = versions.get(match[1]) ?? [];
  group.push(name);
  versions.set(match[1], group);
}

if (invalid.length > 0) {
  console.error("Invalid migration filenames (expected YYYYMMDDHHMMSS_description.sql):");
  for (const name of invalid) console.error(`  - ${name}`);
}

let failed = invalid.length > 0;
for (const [version, names] of versions) {
  if (names.length < 2) continue;
  const allowed = allowedLegacyCollisions.get(version);
  const exactMatch = allowed
    && allowed.length === names.length
    && allowed.every((name) => names.includes(name));

  if (exactMatch) {
    console.warn(`KNOWN LEGACY COLLISION ${version}: ${names.join(", ")}`);
  } else {
    console.error(`UNAPPROVED DUPLICATE MIGRATION VERSION ${version}: ${names.join(", ")}`);
    failed = true;
  }
}

for (const [version, expectedNames] of allowedLegacyCollisions) {
  const actualNames = versions.get(version) ?? [];
  if (actualNames.length !== expectedNames.length
      || !expectedNames.every((name) => actualNames.includes(name))) {
    console.error(`Legacy collision baseline changed for ${version}; review and update the reconciliation record deliberately.`);
    failed = true;
  }
}

if (failed) {
  console.error("Migration version verification failed.");
  process.exitCode = 1;
} else {
  console.log(`Migration filename check passed (${entries.length} files); only the three documented legacy collisions remain.`);
}
