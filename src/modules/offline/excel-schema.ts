import type { OfflineEntity, OfflineRecord } from "./offline-store";

export const EXCEL_SHEETS: readonly OfflineEntity[] = [
  "preauthorizations",
  "preauth_items",
  "patients",
  "insurance_companies",
  "doctors",
  "procedures",
  "diagnosis_codes",
  "preauth_catalog_items",
  "system_settings",
  "preauth_insurer_tariffs",
  "preauthorization_versions",
  "preauthorization_submissions",
  "preauthorization_audit_events",
  "claims_settlement_periods",
  "settlement_exceptions",
  "settlement_exception_audit_events",
];

export type ExcelRow = OfflineRecord & { entity: OfflineEntity; createdAt?: string; updatedAt?: string };

export function serializeExcelValue(value: unknown): unknown {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

export function deserializeExcelValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try { return JSON.parse(trimmed); } catch { return value; }
  }
  return value;
}

export function normalizeExcelRows(entity: OfflineEntity, rows: Record<string, unknown>[]): ExcelRow[] {
  return rows.map((row, index) => {
    const id = String(row.id || `${entity}-${index + 1}`);
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, deserializeExcelValue(value)])) as ExcelRow;
  }).map((row) => ({ ...row, id: String(row.id), entity }));
}
