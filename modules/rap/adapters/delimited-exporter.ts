import { createHash } from "node:crypto";
import type { RapDocumentExporter } from "../adapters/contracts";
import { validateRenderedDocument } from "../core/renderer";

const FORMULA_PREFIX = /^[\u0000-\u0020]*[=+\-@]/;

function safeCell(value: string | number | boolean | null): string {
  if (value === null) return "";
  if (typeof value === "string") {
    // Neutralize spreadsheet formula injection even in unchanged source cells.
    const safe = FORMULA_PREFIX.test(value) ? `'${value}` : value;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  }
  return String(value);
}

function serializeDelimited(
  rows: readonly (readonly { value: string | number | boolean | null }[])[],
  headers: readonly string[],
  delimiter: "," | "\t",
): Uint8Array {
  const lines = [
    headers.map((header) => safeCell(header)).join(delimiter),
    ...rows.map((row) => row.map((cell) => safeCell(cell.value)).join(delimiter)),
  ];
  return new TextEncoder().encode(lines.join("\r\n") + "\r\n");
}

/**
 * A concrete, deterministic exporter for CSV/TSV only. XLS/XLSX require a
 * binary-preserving host adapter because this normalized document contract does
 * not contain original workbook bytes, styles, formulas, or workbook metadata.
 */
export const rapDelimitedExporter: RapDocumentExporter = {
  async exportDraft({ source, rendered, approvedChanges }) {
    validateRenderedDocument(source, rendered, approvedChanges);
    if (source.format !== "CSV" && source.format !== "TSV") {
      throw new Error("RAP XLS/XLSX export requires the host binary-preserving workbook adapter.");
    }
    const delimiter = source.format === "TSV" ? "\t" : ",";
    const bytes = serializeDelimited(rendered.rows, source.headers, delimiter);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    return { bytes, checksum };
  },
};
