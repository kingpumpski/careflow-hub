import * as XLSX from "xlsx";
import { EXCEL_SHEETS, getExcelColumns, getExcelSheetTitle, normalizeExcelRows, serializeExcelValue } from "./excel-schema";
import { listOffline, runOfflineTransaction, type OfflineEntity, type OfflineRecord } from "./offline-store";

export type ExcelExportResult = { workbook: XLSX.WorkBook; filename: string };

function addInstructionSheet(workbook: XLSX.WorkBook): void {
  const rows = [
    ["CareFlow Hub — Offline Backup & Migration Workbook"],
    ["Purpose", "Use this workbook for controlled backup, migration and bulk data preparation. IndexedDB remains the live offline operational store."],
    ["IMPORTANT", "Do not rename worksheets or column headings. Complete only fields marked User Entry. Fields marked System Generated should normally be left blank."],
    ["Import rule", "CareFlow validates IDs, required fields and structural headings before writing data. Invalid workbooks are rejected before the operational store is changed."],
    ["Dates", "Use ISO format YYYY-MM-DD unless the sheet explicitly requires a timestamp."],
    ["Money", "Enter numeric monetary values without currency symbols or thousands separators."],
    ["IDs", "Do not invent relationship IDs. Use IDs already present in the corresponding master-data sheets."],
    ["Settlement warning", "Actual WHT must come from confirmed payment advice. Never derive actual WHT from payment or rejection amounts."],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 24 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "README");
}

function buildEntitySheet(entity: OfflineEntity, records: OfflineRecord[]): XLSX.WorkSheet {
  const columns = getExcelColumns(entity);
  const title = getExcelSheetTitle(entity);
  const headers = columns.map((column) => column.heading);
  const keys = columns.map((column) => column.key);
  const metadata = [
    [`CareFlow Hub — ${title}`],
    ["Purpose", `Operational ${title.toLowerCase()} backup/migration sheet.`],
    ["Instruction", "Enter values only in columns marked User Entry. Keep IDs and relationships consistent with the CareFlow master data."],
    [],
    ["Field", "Required", "Entry", "Description", "Example"],
    ...columns.map((column) => [column.heading, column.required ? "Yes" : "No", column.entry === "system" ? "System Generated" : "User Entry", column.description, column.example ?? ""]),
    [],
    headers,
  ];
  const data = records.map((record) => keys.map((key) => serializeExcelValue(record[key])));
  const sheet = XLSX.utils.aoa_to_sheet([...metadata, ...data]);
  sheet["!cols"] = columns.map((column) => ({ wch: Math.min(48, Math.max(16, column.heading.length + 4)) }));
  sheet["!freeze"] = { xSplit: 0, ySplit: metadata.length };
  return sheet;
}

export async function buildCareFlowWorkbook(): Promise<ExcelExportResult> {
  const workbook = XLSX.utils.book_new();
  addInstructionSheet(workbook);
  for (const entity of EXCEL_SHEETS) {
    const records = await listOffline<OfflineRecord>(entity);
    const sheet = buildEntitySheet(entity, records);
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
    const columns = getExcelColumns(entity);
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
    const headerRow = range.s.r + 8;
    const expected = columns.map((column) => column.heading);
    const actual: string[] = [];
    for (let column = range.s.c; column <= range.e.c; column += 1) actual.push(String(sheet[XLSX.utils.encode_cell({ r: headerRow, c: column })]?.v ?? "").trim());
    const warnings: string[] = [];
    if (actual.length !== expected.length || actual.some((heading, index) => heading !== expected[index])) {
      warnings.push(`${entity}: column headings do not match the CareFlow template. Download a fresh template and do not rename or reorder headings.`);
      validations.push({ entity, rows: [], warnings });
      continue;
    }
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", range: headerRow });
    const rows = normalizeExcelRows(entity, rawRows);
    const ids = new Set<string>();
    rows.forEach((row, index) => {
      if (!row.id || typeof row.id !== "string") warnings.push(`${entity}: row ${index + 2} has no valid id.`);
      else if (ids.has(row.id)) warnings.push(`${entity}: duplicate id ${row.id}.`);
      ids.add(String(row.id));
      columns.filter((column) => column.required).forEach((column) => {
        if (row[column.key] === null || row[column.key] === undefined || String(row[column.key]).trim() === "") warnings.push(`${entity}: ${column.heading} is required on data row ${index + 2}.`);
      });
    });
    validations.push({ entity, rows, warnings });
  }
  return validations;
}

async function applyImportAtomically(validations: ImportValidation[], mode: "replace" | "merge"): Promise<void> {
  await runOfflineTransaction<void>("readwrite", (store, resolve, reject) => {
    const writeRows = () => {
      const rows = validations.flatMap((validation) => validation.rows.map((row) => ({ ...row, entity: validation.entity })));
      let remaining = rows.length;
      if (!remaining) { resolve(); return; }
      rows.forEach((row) => {
        const request = store.put(row);
        request.onerror = () => reject(request.error ?? new Error(`Unable to import ${row.entity} record.`));
        request.onsuccess = () => { remaining -= 1; if (remaining === 0) resolve(); };
      });
    };
    if (mode === "merge") { writeRows(); return; }
    const clearEntity = (index: number) => {
      if (index >= EXCEL_SHEETS.length) { writeRows(); return; }
      const entity = EXCEL_SHEETS[index];
      const request = store.index("entity").getAllKeys(entity);
      request.onerror = () => reject(request.error ?? new Error(`Unable to clear ${entity} before import.`));
      request.onsuccess = () => {
        const keys = request.result;
        let remaining = keys.length;
        if (!remaining) { clearEntity(index + 1); return; }
        keys.forEach((key) => {
          const deletion = store.delete(key);
          deletion.onerror = () => reject(deletion.error ?? new Error(`Unable to clear ${entity} before import.`));
          deletion.onsuccess = () => { remaining -= 1; if (remaining === 0) clearEntity(index + 1); };
        });
      };
    };
    clearEntity(0);
  });
}

export async function importCareFlowWorkbook(file: ArrayBuffer, mode: "replace" | "merge" = "merge"): Promise<ImportValidation[]> {
  const validations = parseCareFlowWorkbook(file);
  const errors = validations.flatMap((validation) => validation.warnings);
  if (errors.length) throw new Error(`Excel import validation failed: ${errors.slice(0, 10).join(" | ")}`);
  await applyImportAtomically(validations, mode);
  return validations;
}
