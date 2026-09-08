export interface AnalyticsPeriod {
  year: number;
  month: number;
}

export function resolvePeriod(row: any, fallbackDate?: Date): AnalyticsPeriod | null {
  const explicitYear = Number(row?.claim_year ?? row?.year);
  const explicitMonth = Number(row?.claim_month ?? row?.month);
  if (Number.isFinite(explicitYear) && explicitYear > 0 && Number.isFinite(explicitMonth) && explicitMonth >= 1 && explicitMonth <= 12) {
    return { year: explicitYear, month: explicitMonth };
  }

  const raw = row?.submission_date
    || row?.submitted_at
    || row?.payment_date
    || row?.withholding_tax_date
    || row?.tax_date
    || row?.created_at;
  if (!raw && !fallbackDate) return null;
  const date = new Date(raw || fallbackDate);
  if (Number.isNaN(date.getTime())) return null;
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function periodKey(period: AnalyticsPeriod | null): string | null {
  return period ? `${period.year}-${String(period.month).padStart(2, "0")}` : null;
}

export function resolvePeriodKey(row: any, fallbackDate?: Date): string | null {
  return periodKey(resolvePeriod(row, fallbackDate));
}

export function latestPeriodKeys(rows: any[][], limit = 12): string[] {
  return [...new Set(rows.flat().map((row) => resolvePeriodKey(row)).filter((key): key is string => Boolean(key)))]
    .sort()
    .slice(-Math.max(0, limit));
}
