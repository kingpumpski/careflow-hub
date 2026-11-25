import test from "node:test";
import assert from "node:assert/strict";
import { auditMigrationSources, normalizeMigrationName, parseLedgerSnapshot } from "../migration-audit.mjs";

const snapshot = `# Snapshot

**Captured:** 2026-11-22 (read-only)
**Project:** \`jajfdgknctzqypdtvmxo\`

| Ledger version | Recorded migration name | Normalized source match |
|---|---|---|
| \`20261122120000\` | \`20261122115900_claims-remittance\` | \`20261122115900_claims_remittance.sql\` |
| \`20261122130000\` | \`legacy_security_patch\` | **No direct match** |
`;

test("normalizes timestamped names and hyphen separators", () => {
  assert.equal(normalizeMigrationName("20261122115900_claims-remittance.sql"), "claims_remittance");
  assert.equal(normalizeMigrationName("claims_remittance"), "claims_remittance");
});

test("parses only ledger rows from the snapshot table", () => {
  const parsed = parseLedgerSnapshot(snapshot);
  assert.equal(parsed.captured, "2026-11-22 (read-only)");
  assert.equal(parsed.projectRef, "jajfdgknctzqypdtvmxo");
  assert.deepEqual(parsed.rows, [
    { version: "20261122120000", name: "20261122115900_claims-remittance" },
    { version: "20261122130000", name: "legacy_security_patch" },
  ]);
});

test("reports direct name matches, unmatched rows, collisions and source hashes without inferring applied state", () => {
  const report = auditMigrationSources({
    snapshotMarkdown: snapshot,
    migrationFiles: [
      { name: "20261122115900_claims_remittance.sql", content: "select 1;" },
      { name: "20261122115900_claims_remittance_v2.sql", content: "select 2;" },
      { name: "20261122115900_other_change.sql", content: "select 3;" },
    ],
  });

  assert.equal(report.snapshot.ledgerRows, 2);
  assert.equal(report.matching.exactNameMatches, 1);
  assert.equal(report.matching.unmatchedLedgerRows[0].reason, "no-direct-source-name-match");
  assert.equal(report.matching.unmatchedSourceFiles.length, 2);
  assert.equal(report.source.duplicateVersionGroups.length, 1);
  assert.match(report.sourceFiles[0].sha256, /^[a-f0-9]{64}$/);
});
