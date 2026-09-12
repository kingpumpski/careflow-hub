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

  if (quoted) throw new Error("RAP delimited document contains an unterminated quoted field.");
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  return rows;
}

const asCell = (value: unknown, row: number, column: number): RapTableCell => ({
  value: value === undefined ? null : (value as string | number | boolean | null),
  row,
  column,
});

function rowsToDocument(rows: unknown[][], format: RapTabularDocument["format"], sheetName?: string): RapTabularDocument {
  const headerValues = (rows[0] ?? []).map((value) => String(value ?? ""));
  return {
    format,
    sheetName,
    headers: headerValues,
    rows: rows.map((row, rowIndex) => row.map((value, columnIndex) => asCell(value, rowIndex, columnIndex))),
  };
}

function readWorkbook(input: Uint8Array | string): XLSX.WorkBook {
  return XLSX.read(input, { type: "array", cellFormula: true, cellStyles: true, cellNF: true });
}

/** Parse every worksheet without mutating the source workbook. */
export function parseTabularWorkbook(
  input: Uint8Array | string,
  format: Extract<RapTabularDocument["format"], "XLSX" | "XLS">,
): RapTabularDocument[] {
  const workbook = readWorkbook(input);
  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error(`RAP worksheet ${sheetName} could not be read.`);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
    return rowsToDocument(rows, format, sheetName);
  });
}

export function parseTabularDocument(input: Uint8Array | string, format: RapTabularDocument["format"]): RapTabularDocument {
  if (format === "CSV" || format === "TSV") {
    const text = typeof input === "string" ? input : new TextDecoder().decode(input);
    const rows = parseDelimited(text.replace(/^\uFEFF/, ""), format === "TSV" ? "\t" : ",");
    return rowsToDocument(rows, format);
  }

  const documents = parseTabularWorkbook(input, format);
  if (!documents[0]) throw new Error("RAP document has no worksheet.");
  return documents[0];
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
    const costItemCode = String(value(costItemCodeColumn) ?? "").trim();
    if (!costItemCode) throw new Error(`RAP document row ${index + 2} is missing a cost item code.`);

    return {
      rowId: String(value(rowIdColumn) ?? index + 2),
      costItemCode,
      costItemDescription: descriptionColumn >= 0 ? String(value(descriptionColumn) ?? "") : undefined,
      quantity: optionalNumber(value(quantityColumn)),
      amount: optionalNumber(value(amountColumn)),
      rejectionReason: rejectionColumn >= 0 ? String(value(rejectionColumn) ?? "") : undefined,
      diagnosisCodes: diagnosisValue
        ? String(diagnosisValue).split(/[,;\n]/).map((code) => code.trim()).filter(Boolean)
        : [],
      source: document.format,
    };
  });
}
