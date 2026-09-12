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
}

export interface ParsedRow {
  index: number;
  values: Record<string, any>;
  errors: string[];
}

/** Normalizes template and human-entered headers, including required `*` markers and BOMs. */
const normalize = (s: any) => String(s ?? "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[*\s_\-/]+/g, "");
const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function toNumber(raw: any): number | null {
  const cleaned = String(raw).replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toDateString(raw: any): string | null {
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw.toISOString().split("T")[0];
  const str = String(raw).trim();
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  if (/^\d{5}$/.test(str)) {
    const d = new Date(Date.UTC(1899, 11, 30) as any);
    d.setUTCDate(d.getUTCDate() + Number(str));
    return d.toISOString().split("T")[0];
  }
  const dmy = str.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmy) {
    const [, a, b, y] = dmy;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
  }
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString().split("T")[0];
}

function coerceMonth(raw: any): number | null {
  const str = String(raw).trim().toLowerCase();
  const named = monthNames.findIndex((m) => m.startsWith(str) && str.length >= 3);
  if (named !== -1) return named + 1;
  const n = toNumber(raw);
  return n && Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
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

      switch (col.type) {
        case "number": {
          const n = toNumber(rawValue);
          if (n === null) errors.push(`${col.label} must be a number`);
          else if (col.min !== undefined && n < col.min) errors.push(`${col.label} must be at least ${col.min}`);
          else if (col.max !== undefined && n > col.max) errors.push(`${col.label} must be at most ${col.max}`);
          else values[col.key] = n;
          break;
        }
        case "integer": {
          const n = /month/i.test(col.key) ? coerceMonth(rawValue) : toNumber(rawValue);
          if (n === null || !Number.isInteger(n)) errors.push(`${col.label} must be a whole number`);
          else if (col.min !== undefined && n < col.min) errors.push(`${col.label} must be at least ${col.min}`);
          else if (col.max !== undefined && n > col.max) errors.push(`${col.label} must be at most ${col.max}`);
          else values[col.key] = n;
          break;
        }
        case "date": {
          const d = toDateString(rawValue);
          if (!d) errors.push(`${col.label} must be a date (YYYY-MM-DD)`);
          else values[col.key] = d;
          break;
        }
        case "boolean": {
          values[col.key] = /^(yes|y|true|1|active)$/i.test(String(rawValue).trim());
          break;
        }
        case "lookup": {
          const target = normalize(rawValue);
          const match = (col.options || []).find((o) => normalize(o.label) === target || o.value === String(rawValue).trim());
          if (!match) errors.push(`${col.label} "${String(rawValue).trim()}" was not found in the system`);
          else values[col.key] = match.value;
          break;
        }
        default:
          values[col.key] = String(rawValue).trim();
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
