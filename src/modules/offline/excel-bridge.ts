import * as XLSX from "xlsx";
import { EXCEL_SHEETS, normalizeExcelRows, serializeExcelValue } from "./excel-schema";
import { clearOfflineEntity, listOffline, putManyOffline, type OfflineEntity, type OfflineRecord } from "./offline-store";

export type ExcelExportResult = { workbook: XLSX.WorkBook; filename: string };

export async function buildCareFlowWorkbook(): Promise<ExcelExportResult> {
  const workbook = XLSX.utils.book_new();
  for (const entity of EXCEL_SHEETS) {
    const records = await listOffline<OfflineRecord>(entity);
    const rows = records.map((record) => Object.fromEntries(Object.entries(record).filter(([key]) => key !== "entity").map(([key, value]) => [key, serializeExcelValue(value)])));
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, entity.slice(0, 31));
  }
  return { workbook, filename: `CareFlow_Internal_Backup_${new Date().toISOString().slice(0, 10)}.xlsx` };
}

export async function exportCareFlowWorkbook(): Promise<string> {
  const { workbook, filename } = await buildCareFlowWorkbook();
  XLSX.writeFile(workbook, filename);
  return filename;
}

export type ImportValidation = { entity: OfflineEntity; rows: OfflineRecord[]; warnings: string[] };

export function parseCareFlowWorkbook(file: ArrayBuffer): ImportValidation[] {
  const workbook = XLSX.read(file, { type: "array", cellDates: false });
  const validations: ImportValidation[] = [];
  for (const entity of EXCEL_SHEETS) {
    const sheetName = entity.slice(0, 31);
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const rows = normalizeExcelRows(entity, rawRows);
    const warnings: string[] = [];
    const ids = new Set<string>();
    rows.forEach((row, index) => {
      if (!row.id || typeof row.id !== "string") warnings.push(`${entity}: row ${index + 2} has no valid id.`);
      else if (ids.has(row.id)) warnings.push(`${entity}: duplicate id ${row.id}.`);
      ids.add(String(row.id));
    });
    validations.push({ entity, rows, warnings });
  }
  return validations;
}

export async function importCareFlowWorkbook(file: ArrayBuffer, mode: "replace" | "merge" = "merge"): Promise<ImportValidation[]> {
  const validations = parseCareFlowWorkbook(file);
  const errors = validations.flatMap((validation) => validation.warnings);
  if (errors.length) throw new Error(`Excel import validation failed: ${errors.slice(0, 10).join(" | ")}`);
  if (mode === "replace") {
    for (const entity of EXCEL_SHEETS) await clearOfflineEntity(entity);
  }
  for (const validation of validations) await putManyOffline(validation.entity, validation.rows);
  return validations;
}
