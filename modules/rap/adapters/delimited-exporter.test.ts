import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { rapDelimitedExporter } from "./delimited-exporter";
import type { RapTabularDocument } from "../core/types";

const document: RapTabularDocument = {
  format: "CSV",
  headers: ["Code", "Diagnosis", "Comment"],
  rows: [
    [
      { value: "C-1", row: 0, column: 0 },
      { value: "A00.1", row: 0, column: 1 },
      { value: 'Needs "review", please', row: 0, column: 2 },
    ],
  ],
};

describe("RAP delimited exporter", () => {
  it("serializes CSV with RFC-style quoting and a final-byte SHA-256 checksum", async () => {
    const result = await rapDelimitedExporter.exportDraft({
      source: document,
      rendered: { ...document, changes: [] },
      approvedChanges: [],
    });
    const text = new TextDecoder().decode(result.bytes);
    expect(text).toContain('"Needs ""review"", please"');
    expect(text.endsWith("\r\n")).toBe(true);
    expect(result.checksum).toBe(createHash("sha256").update(result.bytes).digest("hex"));
  });

  it("neutralizes formula-like strings, including unchanged source cells", async () => {
    const source = { ...document, rows: [[
      { value: "=1+1", row: 0, column: 0 },
      { value: "+SUM(A1:A2)", row: 0, column: 1 },
      { value: "@cmd", row: 0, column: 2 },
    ]] };
    const result = await rapDelimitedExporter.exportDraft({
      source,
      rendered: { ...source, changes: [] },
      approvedChanges: [],
    });
    expect(new TextDecoder().decode(result.bytes)).toContain("'=1+1,'+SUM(A1:A2),'@cmd");
  });

  it("uses tab delimiters for TSV", async () => {
    const source = { ...document, format: "TSV" as const };
    const result = await rapDelimitedExporter.exportDraft({
      source,
      rendered: { ...source, changes: [] },
      approvedChanges: [],
    });
    expect(new TextDecoder().decode(result.bytes).split("\r\n")[0]).toBe("Code\tDiagnosis\tComment");
  });

  it("refuses to pretend a normalized document preserves XLSX binary metadata", async () => {
    const source = { ...document, format: "XLSX" as const };
    await expect(rapDelimitedExporter.exportDraft({
      source,
      rendered: { ...source, changes: [] },
      approvedChanges: [],
    })).rejects.toThrow(/binary-preserving workbook adapter/i);
  });

  it("rejects a rendered mutation not included in the approved change list", async () => {
    const rendered = { ...document, rows: document.rows.map((row) => row.map((cell) => ({ ...cell }))), changes: [] };
    rendered.rows[0][0].value = "MUTATED";
    await expect(rapDelimitedExporter.exportDraft({
      source: document,
      rendered,
      approvedChanges: [],
    })).rejects.toThrow(/unapproved change/i);
  });
});
