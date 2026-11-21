export interface InsuranceHistoryRow {
  sheet: string;
  sourceRow: number;
  year: number;
  month: number;
  insurerNameRaw: string;
  submitted: number;
  rejected: number;
  paid: number;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const normalizeHeader = (value: unknown) => String(value ?? "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const isBlank = (value: unknown) => value == null || String(value).trim() === "";

function parseAmount(value: unknown, field: string, sheet: string, row: number, required = false): number {
  if (isBlank(value)) {
    if (required) throw new Error(sheet + ", row " + row + ": " + field + " is required.");
    return 0;
  }
  let amount: number | null = null;
  if (typeof value === "number") amount = Number.isFinite(value) ? value : null;
  else {
    const raw = String(value).trim();
    if (/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(raw)) {
      const parsed = Number(raw.replace(/,/g, ""));
      amount = Number.isFinite(parsed) ? parsed : null;
    }
  }
  if (amount === null) throw new Error(sheet + ", row " + row + ": " + field + " must be a valid number. Use digits and optional comma thousands separators.");
  if (amount < 0) throw new Error(sheet + ", row " + row + ": " + field + " cannot be negative.");
  return amount;
}

function detectMonth(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) && value >= 1 && value <= 12 ? value : null;
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (/^\d{1,2}$/.test(raw)) {
    const month = Number(raw);
    return month >= 1 && month <= 12 ? month : null;
  }
  const namedMonth = raw.match(/^([a-z]{3,9})(?:[\s/-]*\d{2,4})?$/);
  return namedMonth ? MONTHS[namedMonth[1]] ?? null : null;
}

function parseYear(value: unknown, fallback: number, sheet: string, row: number): number {
  if (isBlank(value)) return fallback;
  const raw = String(value).trim();
  if (!/^\d{4}$/.test(raw)) throw new Error(sheet + ", row " + row + ": Year must be a four-digit year.");
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new Error(sheet + ", row " + row + ": Year must be between 1900 and 2100.");
  }
  return year;
}

/**
 * Parses both supported insurance-history workbook layouts:
 * long rows (insurer/month/submitted/rejected/paid) and wide month columns.
 * Any non-empty data row with malformed financial data is rejected instead of silently becoming zero.
 */
export function parseInsuranceHistorySheet(
  sheetName: string,
  rows: unknown[][],
  fallbackYear: number,
): InsuranceHistoryRow[] {
  if (!rows.length) return [];
  const sheetYearMatch = sheetName.match(/(20\d{2}|19\d{2})/);
  const sheetYear = sheetYearMatch ? Number(sheetYearMatch[1]) : fallbackYear;
  let headerIndex = -1;
  for (let index = 0; index < Math.min(rows.length, 5); index++) {
    if (rows[index].map(normalizeHeader).some((cell) => cell.includes("insur") || cell.includes("company"))) {
      headerIndex = index;
      break;
    }
  }
  if (headerIndex < 0) return [];

  const header = rows[headerIndex].map(normalizeHeader);
  const insurerColumn = header.findIndex((cell) => cell.includes("insur") || cell.includes("company") || cell === "name");
  if (insurerColumn < 0) return [];
  const monthColumn = header.findIndex((cell) => cell === "month" || cell === "period");
  const yearColumn = header.findIndex((cell) => cell === "year" || cell === "claimyear");
  const submittedColumn = header.findIndex((cell) => cell.includes("submit"));
  const rejectedColumn = header.findIndex((cell) => cell.includes("reject"));
  const paidColumn = header.findIndex((cell) => cell.includes("paid"));
  const output: InsuranceHistoryRow[] = [];

  if (monthColumn >= 0 && submittedColumn >= 0) {
    for (let index = headerIndex + 1; index < rows.length; index++) {
      const source = rows[index] ?? [];
      if (source.every(isBlank)) continue;
      const rowNumber = index + 1;
      const insurerNameRaw = String(source[insurerColumn] ?? "").trim();
      const month = detectMonth(source[monthColumn]);
      const hasRelevantData = [monthColumn, submittedColumn, rejectedColumn, paidColumn]
        .some((column) => column >= 0 && !isBlank(source[column]));
      if (!hasRelevantData) continue;
      if (!insurerNameRaw) throw new Error(sheetName + ", row " + rowNumber + ": Insurance Company is required.");
      if (!month) throw new Error(sheetName + ", row " + rowNumber + ": Month must be 1-12 or a full/short month name.");
      const year = parseYear(yearColumn >= 0 ? source[yearColumn] : null, sheetYear, sheetName, rowNumber);
      output.push({
        sheet: sheetName,
        sourceRow: rowNumber,
        year,
        month,
        insurerNameRaw,
        submitted: parseAmount(source[submittedColumn], "Submitted", sheetName, rowNumber, true),
        rejected: rejectedColumn >= 0 ? parseAmount(source[rejectedColumn], "Rejected", sheetName, rowNumber) : 0,
        paid: paidColumn >= 0 ? parseAmount(source[paidColumn], "Paid", sheetName, rowNumber) : 0,
      });
    }
    return output;
  }

  const monthColumns = header
    .map((cell, column) => ({ column, month: detectMonth(cell) }))
    .filter((entry): entry is { column: number; month: number } => entry.month !== null);
  if (!monthColumns.length) return [];

  for (let index = headerIndex + 1; index < rows.length; index++) {
    const source = rows[index] ?? [];
    if (source.every(isBlank)) continue;
    const populatedMonths = monthColumns.filter(({ column }) => !isBlank(source[column]));
    if (!populatedMonths.length) continue;
    const rowNumber = index + 1;
    const insurerNameRaw = String(source[insurerColumn] ?? "").trim();
    if (!insurerNameRaw) throw new Error(sheetName + ", row " + rowNumber + ": Insurance Company is required when month amounts are supplied.");
    for (const monthColumnEntry of populatedMonths) {
      const submitted = parseAmount(source[monthColumnEntry.column], "Submitted", sheetName, rowNumber, true);
      if (submitted === 0) continue;
      output.push({
        sheet: sheetName,
        sourceRow: rowNumber,
        year: sheetYear,
        month: monthColumnEntry.month,
        insurerNameRaw,
        submitted,
        rejected: 0,
        paid: 0,
      });
    }
  }
  return output;
}

/** Rejects conflicting duplicate insurer-period rows before any database writes begin. */
export function assertNoConflictingInsurancePeriods(rows: InsuranceHistoryRow[], getInsurerKey: (row: InsuranceHistoryRow) => string | null = (row) => row.insurerNameRaw.trim().toLowerCase().replace(/\s+/g, " ")): void {
  const seen = new Map<string, InsuranceHistoryRow>();
  for (const row of rows) {
    const insurerKey = getInsurerKey(row);
    if (!insurerKey) continue;
    const key = insurerKey + "|" + row.year + "|" + row.month;
    const previous = seen.get(key);
    if (!previous) {
      seen.set(key, row);
      continue;
    }
    const sameAmounts = previous.submitted === row.submitted
      && previous.rejected === row.rejected
      && previous.paid === row.paid;
    if (!sameAmounts) {
      throw new Error(
        "Conflicting entries for " + row.insurerNameRaw + ", " + row.year + "-" + String(row.month).padStart(2, "0")
        + " in " + previous.sheet + " row " + previous.sourceRow + " and " + row.sheet + " row " + row.sourceRow
        + ". Resolve the duplicate period before importing.",
      );
    }
  }
}
