import { createHash } from "node:crypto";

export function normalizeMigrationName(value) {
  return value
    .trim()
    .replace(/\.sql$/i, "")
    .replace(/^\d{14}_/, "")
    .replace(/-/g, "_")
    .toLowerCase();
}

export function parseLedgerSnapshot(markdown) {
  const captured = markdown.match(/^\*\*Captured:\*\*\s*(.+)$/m)?.[1]?.trim() ?? null;
  const projectRef = markdown.match(/^\*\*Project:\*\*\s*`?([a-z0-9]+)`?\s*$/m)?.[1] ?? null;
  const lines = markdown.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) =>
    line.includes("Ledger version") && line.includes("Recorded migration name"),
  );

  if (headerIndex < 0) {
    throw new Error("Migration ledger snapshot table header was not found.");
  }

  const rows = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.trim().startsWith("|")) {
      if (rows.length > 0) break;
      continue;
    }
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim().replace(/^`|`$/g, ""));
    if (cells.length < 2 || !/^\d{14}$/.test(cells[0])) continue;
    rows.push({ version: cells[0], name: cells[1] });
  }

  if (rows.length === 0) {
    throw new Error("Migration ledger snapshot contains no parseable ledger rows.");
  }

  return { captured, projectRef, rows };
}

export function auditMigrationSources({ migrationFiles, snapshotMarkdown }) {
  const snapshot = parseLedgerSnapshot(snapshotMarkdown);
  const sourceByName = new Map();
  const invalidFiles = [];
  const versionGroups = new Map();
  const sourceFiles = migrationFiles
    .filter((file) => file.name.endsWith(".sql"))
    .map((file) => {
      const match = /^(\d{14})_(.+)\.sql$/.exec(file.name);
      if (!match) {
        invalidFiles.push(file.name);
        return null;
      }
      const normalizedName = normalizeMigrationName(file.name);
      const entry = {
        name: file.name,
        version: match[1],
        normalizedName,
        sha256: createHash("sha256").update(file.content).digest("hex"),
      };
      const matches = sourceByName.get(normalizedName) ?? [];
      matches.push(entry);
      sourceByName.set(normalizedName, matches);
      const group = versionGroups.get(match[1]) ?? [];
      group.push(file.name);
      versionGroups.set(match[1], group);
      return entry;
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  const matchedLedgerRows = [];
  const unmatchedLedgerRows = [];
  const matchedSourceNames = new Set();

  for (const row of snapshot.rows) {
    const normalizedName = normalizeMigrationName(row.name);
    const candidates = sourceByName.get(normalizedName) ?? [];
    if (candidates.length === 1) {
      matchedLedgerRows.push({ ...row, source: candidates[0].name, sourceSha256: candidates[0].sha256 });
      matchedSourceNames.add(candidates[0].name);
    } else {
      unmatchedLedgerRows.push({
        ...row,
        reason: candidates.length > 1 ? "ambiguous-source-name" : "no-direct-source-name-match",
        candidateFiles: candidates.map((candidate) => candidate.name),
      });
    }
  }

  const unmatchedSourceFiles = sourceFiles.filter((file) => !matchedSourceNames.has(file.name));
  const duplicateVersionGroups = [...versionGroups.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([version, names]) => ({ version, files: [...names].sort() }))
    .sort((a, b) => a.version.localeCompare(b.version));

  return {
    snapshot: { captured: snapshot.captured, projectRef: snapshot.projectRef, ledgerRows: snapshot.rows.length },
    source: { migrationFiles: sourceFiles.length, invalidFiles, duplicateVersionGroups },
    matching: {
      exactNameMatches: matchedLedgerRows.length,
      unmatchedLedgerRows,
      unmatchedSourceFiles: unmatchedSourceFiles.map((file) => ({
        name: file.name,
        version: file.version,
        sha256: file.sha256,
      })),
    },
    matchedLedgerRows,
    sourceFiles,
  };
}
