import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { auditMigrationSources } from "./migration-audit.mjs";

export async function runMigrationAudit(root = process.cwd()) {
  const migrationsDir = join(root, "supabase", "migrations");
  const snapshotPath = join(root, "docs", "MIGRATION_LEDGER_SNAPSHOT_2026-11-22.md");
  const names = await readdir(migrationsDir);
  const migrationFiles = await Promise.all(
    names.filter((name) => name.endsWith(".sql")).map(async (name) => ({
      name,
      content: await readFile(join(migrationsDir, name), "utf8"),
    })),
  );
  const snapshotMarkdown = await readFile(snapshotPath, "utf8");
  return auditMigrationSources({ migrationFiles, snapshotMarkdown });
}

function printReport(report) {
  console.log("CareFlow migration source reconciliation audit (read-only)");
  console.log(`Snapshot: ${report.snapshot.captured ?? "date unavailable"} | project: ${report.snapshot.projectRef ?? "unknown"}`);
  console.log(`Source SQL files: ${report.source.migrationFiles}`);
  console.log(`Historical ledger rows in snapshot: ${report.snapshot.ledgerRows}`);
  console.log(`Exact normalized-name matches: ${report.matching.exactNameMatches}`);
  console.log(`Ledger rows without unique direct source match: ${report.matching.unmatchedLedgerRows.length}`);
  console.log(`Source files without direct ledger-name match: ${report.matching.unmatchedSourceFiles.length}`);
  console.log(`Duplicate source version groups: ${report.source.duplicateVersionGroups.length}`);

  for (const group of report.source.duplicateVersionGroups) {
    console.warn(`DUPLICATE VERSION ${group.version}: ${group.files.join(", ")}`);
  }
  for (const row of report.matching.unmatchedLedgerRows) {
    console.warn(`UNMATCHED LEDGER ${row.version} ${row.name} [${row.reason}]`);
  }
  for (const file of report.source.invalidFiles) {
    console.error(`INVALID SOURCE FILENAME: ${file}`);
  }
  console.log("SHA-256 hashes are included in --json output for source provenance.");
  console.log("This audit compares names only. It does not establish applied state or semantic equivalence.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = await runMigrationAudit();
    if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
    else printReport(report);
    if (report.source.invalidFiles.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
