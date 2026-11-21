import * as XLSX from "xlsx";

export type ImportColumnType = "text" | "number" | "integer" | "date" | "boolean" | "lookup";

export interface ImportColumn {
  key: string;
  label: string;
  required?: boolean;
  type?: ImportColumnType;
  /** Accepted header aliases for files prepared outside our template. */
  aliases?: string[];
  /** Accepted values for lookup columns: user supplies the label, we store the value. */
  options?: { label: string; value: string }[];
  /** Example value shown in the downloadable template. */
  example?: string | number;
  /** Inclusive numeric lower bound for number/integer columns. */
  min?: number;
  /** Inclusive numeric upper bound for number/integer columns. */
  max?: number;
  /** Extra guidance shown in the template guide. */
  hint?: string;
  /** Reject repeated non-empty values in this column within the same uploaded file. */
  unique?: boolean;
}

export interface ParsedRow {
  index: number;
  values: Record<string, any>;
  errors: string[];
}

/** Normalizes template and human-entered headers, including required markers and BOMs. */
const normalize = (s: any) => String(s ?? "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[*\s_\\/-]+/g, "");
const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function toNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const str = String(raw ?? "").trim();
  if (!str || !/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(str)) return null;
  const n = Number(str.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function validDateParts(year: number, month: number, day: number): boolean {
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function toDateString(raw: unknown): string | null {
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw.toISOString().split("T")[0];
  const str = String(raw ?? "").trim();
  if (!str) return null;

  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [, y, m, d] = iso.map(Number);
    return validDateParts(y, m, d) ? str : null;
  }

  if (/^\d{5}$/.test(str)) {
    const serial = Number(str);
    if (serial < 1 || serial > 2958465) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
  }

  const dmy = str.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmy) {
    const [, dayText, monthText, yearText] = dmy;
    const year = yearText.length === 2 ? Number(`20${yearText}`) : Number(yearText);
    const day = Number(dayText);
    const month = Number(monthText);
    if (!validDateParts(year, month, day)) return null;
    return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  }

  return null;
}

function coerceMonth(raw: unknown): number | null {
  const str = String(raw).trim().toLowerCase();
  const named = monthNames.findIndex((m) => m.startsWith(str) && str.length >= 3);
  if (named !== -1) return named + 1;
  const n = toNumber(raw);
  return n !== null && Number.isInteger(n) ? n : null;
}

function toBoolean(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  const value = String(raw ?? "").trim().toLowerCase();
  if (["yes", "y", "true", "1", "active"].includes(value)) return true;
  if (["no", "n", "false", "0", "inactive"].includes(value)) return false;
  return null;
}

/** Reads a CSV or Excel file into an array of raw header-keyed objects. */
export async function readTabularFile(file: File): Promise<Record<string, any>[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames.find((n) => !/guide|instruction|readme/i.test(n)) || wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "", raw: false, blankrows: false });
}

/** Maps and validates raw rows against the column specification. */
export function mapRows(raw: Record<string, any>[], columns: ImportColumn[]): ParsedRow[] {
  const seenUnique = new Map<string, Map<string, number>>();
  return raw.map((source, i) => {
    const headerMap: Record<string, any> = {};
    Object.entries(source).forEach(([k, v]) => { headerMap[normalize(k)] = v; });
    const values: Record<string, any> = {};
    const errors: string[] = [];

    columns.forEach((col) => {
      const candidates = [col.key, col.label, ...(col.aliases || []), col.label.replace(/\*/g, ""), `${col.label.replace(/\*/g, "")}*`];
      let rawValue: any = "";
      for (const c of candidates) {
        const hit = headerMap[normalize(c)];
        if (hit !== undefined && String(hit).trim() !== "") { rawValue = hit; break; }
      }
      const isEmpty = rawValue === undefined || String(rawValue).trim() === "";
      if (isEmpty) {
        if (col.required) errors.push(`${col.label} is required`);
        return;
      }

      let parsedValue: any;
      switch (col.type) {
        case "number": {
          const n = toNumber(rawValue);
          if (n === null) errors.push(`${col.label} must be a valid number`);
          else if (col.min !== undefined && n < col.min) errors.push(`${col.label} must be at least ${col.min}`);
          else if (col.max !== undefined && n > col.max) errors.push(`${col.label} must be at most ${col.max}`);
          else parsedValue = n;
          break;
        }
        case "integer": {
          const n = /month/i.test(col.key) ? coerceMonth(rawValue) : toNumber(rawValue);
          if (n === null || !Number.isInteger(n)) errors.push(`${col.label} must be a whole number`);
          else if (col.min !== undefined && n < col.min) errors.push(`${col.label} must be at least ${col.min}`);
          else if (col.max !== undefined && n > col.max) errors.push(`${col.label} must be at most ${col.max}`);
          else parsedValue = n;
          break;
        }
        case "date": {
          const d = toDateString(rawValue);
          if (!d) errors.push(`${col.label} must be a valid date (YYYY-MM-DD)`);
          else parsedValue = d;
          break;
        }
        case "boolean": {
          const b = toBoolean(rawValue);
          if (b === null) errors.push(`${col.label} must be yes or no`);
          else parsedValue = b;
          break;
        }
        case "lookup": {
          const target = normalize(rawValue);
          const match = (col.options || []).find((o) => normalize(o.label) === target || o.value === String(rawValue).trim());
          if (!match) errors.push(`${col.label} "${String(rawValue).trim()}" was not found in the system`);
          else parsedValue = match.value;
          break;
        }
        default:
          parsedValue = String(rawValue).trim();
      }

      if (parsedValue !== undefined) {
        values[col.key] = parsedValue;
        if (col.unique) {
          const key = normalize(parsedValue);
          const occurrences = seenUnique.get(col.key) ?? new Map<string, number>();
          const firstRow = occurrences.get(key);
          if (firstRow !== undefined) errors.push(`${col.label} "${String(rawValue).trim()}" duplicates row ${firstRow}`);
          else occurrences.set(key, i + 2);
          seenUnique.set(col.key, occurrences);
        }
      }
    });

    return { index: i + 2, values, errors };
  }).filter((r) => Object.keys(r.values).length > 0 || r.errors.length > 0);
}

/** Builds a downloadable template (Excel with guide sheet, or plain CSV). */
export function buildTemplate(columns: ImportColumn[], fileName: string, format: "csv" | "excel") {
  const headers = columns.map((c) => (c.required ? `${c.label}*` : c.label));

  if (format === "csv") {
    const esc = (v: any) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = `${headers.map(esc).join(",")}\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(16, h.length + 4) }));
  XLSX.utils.book_append_sheet(wb, ws, "Data");

  const guide = [
    ["Column", "Required", "Expected format", "Notes"],
    ...columns.map((c) => [
      c.label,
      c.required ? "Yes" : "No",
      c.type === "lookup"
        ? `One of: ${(c.options || []).slice(0, 12).map((o) => o.label).join(" | ") || "(add records first)"}`
        : c.type === "date" ? "YYYY-MM-DD"
        : c.type === "integer" ? "Whole number"
        : c.type === "number" ? "Amount (numbers only)"
        : c.type === "boolean" ? "Yes / No"
        : "Text",
      c.hint || "",
    ]),
    [],
    ["Data sheet: Data — keep the header row and enter your records below it."],
    ["Guide sheet: Guide — contains field definitions and is ignored automatically during import."],
    ["This template intentionally contains headers only; there are no sample records to delete."],
  ];
  const gws = XLSX.utils.aoa_to_sheet(guide);
  gws["!cols"] = [{ wch: 26 }, { wch: 10 }, { wch: 52 }, { wch: 48 }];
  XLSX.utils.book_append_sheet(wb, gws, "Guide");
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}
