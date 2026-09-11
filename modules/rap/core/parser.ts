import * as XLSX from "xlsx";
import type { RapParsedItem, RapTableCell, RapTabularDocument } from "./types";

const HEADER_ALIASES = {
  rowId: ["row_id", "row id", "id", "claim item id"],
  costItemCode: ["cost item code", "cost_item_code", "item code", "code"],
  costItemDescription: ["cost item description", "cost_item_description", "description"],
  quantity: ["quantity", "qty"],
  amount: ["amount", "cost", "total", "total amount"],
  rejectionReason: ["rejection reason", "rejection_reason", "reason"],
  diagnosis: ["diagnosis", "diagnosis code", "diagnosis_code", "icd", "icd-10"],
} as const;

const normalizeHeader = (value: unknown) => String(value ?? "").trim().toLowerCase();

function findHeader(headers: string[], aliases: readonly string[]): number {
  return headers.findIndex((header) => aliases.includes(normalizeHeader(header)));
}

function parseDelimited(text: string, delimiter: "," | "\t"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

const asCell = (value: unknown, row: number, column: number): RapTableCell => ({
  value: value === undefined ? null : (value as string | number | boolean | null),
  row,
  column,
});

function rowsToDocument(rows: unknown[][], format: RapTabularDocument["format"]): RapTabularDocument {
  const headerValues = (rows[0] ?? []).map((value) => String(value ?? ""));
  return {
    format,
    headers: headerValues,
    rows: rows.map((row, rowIndex) => row.map((value, columnIndex) => asCell(value, rowIndex, columnIndex))),
  };
}

export function parseTabularDocument(input: Uint8Array | string, format: RapTabularDocument["format"]): RapTabularDocument {
  if (format === "CSV" || format === "TSV") {
    const text = typeof input === "string" ? input : new TextDecoder().decode(input);
    const rows = parseDelimited(text.replace(/^\uFEFF/, ""), format === "TSV" ? "\t" : ",");
    return rowsToDocument(rows, format);
  }

  const workbook = XLSX.read(input, { type: "array", cellFormula: true, cellStyles: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) throw new Error("RAP document has no worksheet.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, raw: true, defval: null });
  return rowsToDocument(rows, format);
}

export function extractParsedItems(document: RapTabularDocument): RapParsedItem[] {
  const header = document.headers;
  const rowIdColumn = findHeader(header, HEADER_ALIASES.rowId);
  const costItemCodeColumn = findHeader(header, HEADER_ALIASES.costItemCode);
  if (costItemCodeColumn < 0) throw new Error("RAP document is missing a cost item code column.");

  const descriptionColumn = findHeader(header, HEADER_ALIASES.costItemDescription);
  const quantityColumn = findHeader(header, HEADER_ALIASES.quantity);
  const amountColumn = findHeader(header, HEADER_ALIASES.amount);
  const rejectionColumn = findHeader(header, HEADER_ALIASES.rejectionReason);
  const diagnosisColumn = findHeader(header, HEADER_ALIASES.diagnosis);

  return document.rows.slice(1).map((row, index) => {
    const value = (column: number) => (column >= 0 ? row[column]?.value : null);
    const diagnosisValue = value(diagnosisColumn);
    return {
      rowId: String(value(rowIdColumn) ?? index + 2),
      costItemCode: String(value(costItemCodeColumn) ?? "").trim(),
      costItemDescription: descriptionColumn >= 0 ? String(value(descriptionColumn) ?? "") : undefined,
      quantity: quantityColumn >= 0 ? Number(value(quantityColumn)) : undefined,
      amount: amountColumn >= 0 ? Number(value(amountColumn)) : undefined,
      rejectionReason: rejectionColumn >= 0 ? String(value(rejectionColumn) ?? "") : undefined,
      diagnosisCodes: diagnosisValue ? String(diagnosisValue).split(/[,;\n]/).map((code) => code.trim()).filter(Boolean) : [],
      source: document.format,
    };
  });
}
