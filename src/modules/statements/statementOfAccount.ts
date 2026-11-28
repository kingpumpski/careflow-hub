export type StatementLedgerEntry = {
  id: string;
  entry_date: string;
  created_at?: string;
  entry_type: string;
  account_debit: string;
  account_credit: string;
  amount: number | string;
  insurance_company_id?: string | null;
  reference?: string | null;
  description?: string | null;
};

export type StatementLine = {
  id: string;
  date: string;
  description: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  entryType: string;
};

export type StatementSummary = {
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  closingSide: "debit" | "credit" | "zero";
  lines: StatementLine[];
};

/**
 * Builds an insurer's Accounts Receivable statement from posted ledger entries.
 * Insurer-paid WHT appears only when its certificate receipt has generated the
 * tax-credit journal; provisional WHT estimates and tax-control postings do
 * not reduce the insurer's receivable balance.
 */
export function buildCompanyStatement(
  entries: StatementLedgerEntry[],
  companyId: string,
  startDate: string,
  endDate: string,
): StatementSummary {
  if (!companyId) throw new Error("Select a company to generate its statement.");
  if (!startDate || !endDate || startDate > endDate) {
    throw new Error("Enter a valid statement period.");
  }

  const relevant = entries
    .filter((entry) => entry.insurance_company_id === companyId)
    .filter((entry) => {
      const debitAccount = entry.account_debit.trim().toLowerCase();
      const creditAccount = entry.account_credit.trim().toLowerCase();
      return debitAccount === "accounts receivable" || creditAccount === "accounts receivable";
    })
    .map((entry) => {
      const amount = Number(entry.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error("The ledger contains an invalid amount; statement generation was stopped.");
      }
      const isDebit = entry.account_debit.trim().toLowerCase() === "accounts receivable";
      const isCredit = entry.account_credit.trim().toLowerCase() === "accounts receivable";
      if (isDebit === isCredit) {
        throw new Error("A ledger row has an ambiguous Accounts Receivable posting.");
      }
      return { entry, amount, debit: isDebit ? amount : 0, credit: isCredit ? amount : 0 };
    })
    .sort((a, b) => a.entry.entry_date.localeCompare(b.entry.entry_date)
      || String(a.entry.created_at || "").localeCompare(String(b.entry.created_at || ""))
      || a.entry.id.localeCompare(b.entry.id));

  const allRows = relevant;

  const beforePeriod = allRows.filter(({ entry }) => entry.entry_date < startDate);
  const openingBalance = beforePeriod.reduce((sum, row) => sum + row.debit - row.credit, 0);
  const periodRows = allRows.filter(({ entry }) => entry.entry_date >= startDate && entry.entry_date <= endDate);
  let runningBalance = openingBalance;
  const lines: StatementLine[] = periodRows.map(({ entry, debit, credit }) => {
    runningBalance += debit - credit;
    return {
      id: entry.id,
      date: entry.entry_date,
      description: entry.description?.trim() || entry.entry_type.replace(/_/g, " "),
      reference: entry.reference || "—",
      debit,
      credit,
      balance: runningBalance,
      entryType: entry.entry_type,
    };
  });
  const totalDebit = periodRows.reduce((sum, row) => sum + row.debit, 0);
  const totalCredit = periodRows.reduce((sum, row) => sum + row.credit, 0);
  const closingBalance = openingBalance + totalDebit - totalCredit;
  return {
    openingBalance,
    totalDebit,
    totalCredit,
    closingBalance,
    closingSide: Math.abs(closingBalance) < 0.005 ? "zero" : closingBalance > 0 ? "debit" : "credit",
    lines,
  };
}

export function formatStatementAmount(amount: number): string {
  return new Intl.NumberFormat("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount));
}

export type StatementClaimRow = {
  claim_year: number | null;
  claim_month: number | null;
  claim_amount: number | string;
  status: string;
};

export type StatementTaxRow = {
  year: number;
  month: number;
  tax_amount: number | string | null;
  is_actual: boolean;
};

export type StatementSettlementPeriod = {
  period_start: string;
  period_end: string;
  period_type: string;
  rejection_amount: number | string | null;
  provisional_withholding_tax: number | string | null;
  actual_withholding_tax: number | string | null;
  settlement_status: string;
};

export type StatementReconciliation = {
  rejectedClaimsTotal: number;
  provisionalWhtTotal: number;
  actualWhtTotal: number;
  effectiveWhtTotal: number;
  monthlyBreakdown: Array<{
    year: number;
    month: number;
    rejected: number;
    provisionalWht: number;
    actualWht: number;
    effectiveWht: number;
    whtBasis: "actual" | "provisional" | "none";
  }>;
};

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;
const monthEndDate = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

/**
 * Reconcile the three live source tables without relying on newer view columns:
 * monthly settlement-period figures take precedence over claim/WHT table
 * fallbacks for that insurer-month. Confirmed actual WHT replaces provisional.
 */
export function buildStatementReconciliation(
  claims: StatementClaimRow[],
  taxRows: StatementTaxRow[],
  settlementPeriods: StatementSettlementPeriod[],
  startDate: string,
  endDate: string,
): StatementReconciliation {
  if (!startDate || !endDate || startDate > endDate) {
    throw new Error("Enter a valid statement period for claims and tax totals.");
  }

  const selectedKeys = new Set<string>();
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor <= end) {
    selectedKeys.add(monthKey(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const claimsByMonth = new Map<string, number>();
  claims.forEach((claim) => {
    if (claim.claim_year == null || claim.claim_month == null
      || claim.claim_month < 1 || claim.claim_month > 12
      || claim.status.trim().toLowerCase() !== "rejected") return;
    const key = monthKey(claim.claim_year, claim.claim_month);
    if (!selectedKeys.has(key)) return;
    claimsByMonth.set(key, (claimsByMonth.get(key) || 0) + Number(claim.claim_amount || 0));
  });

  const taxByMonth = new Map<string, { provisional: number; actual: number; actualCount: number }>();
  taxRows.forEach((tax) => {
    if (!Number.isInteger(tax.year) || !Number.isInteger(tax.month) || tax.month < 1 || tax.month > 12) return;
    const key = monthKey(tax.year, tax.month);
    if (!selectedKeys.has(key)) return;
    const current = taxByMonth.get(key) || { provisional: 0, actual: 0, actualCount: 0 };
    const amount = Number(tax.tax_amount || 0);
    if (tax.is_actual) {
      current.actual += amount;
      current.actualCount += 1;
    } else {
      current.provisional += amount;
    }
    taxByMonth.set(key, current);
  });

  const settlementByMonth = new Map<string, {
    provisional: number;
    actual: number;
    actualCount: number;
    rejected: number;
  }>();
  settlementPeriods.forEach((period) => {
    if (period.period_type !== "month") return;
    const year = Number(period.period_start.slice(0, 4));
    const month = Number(period.period_start.slice(5, 7));
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return;
    const key = monthKey(year, month);
    if (!selectedKeys.has(key)
      || period.period_start !== `${key}-01`
      || period.period_end !== monthEndDate(year, month)) return;
    const current = settlementByMonth.get(key) || { provisional: 0, actual: 0, actualCount: 0, rejected: 0 };
    current.provisional += Number(period.provisional_withholding_tax || 0);
    current.rejected += Number(period.rejection_amount || 0);
    if (["payment_advice_received", "reconciled"].includes(period.settlement_status)
      && period.actual_withholding_tax != null) {
      current.actual += Number(period.actual_withholding_tax);
      current.actualCount += 1;
    }
    settlementByMonth.set(key, current);
  });

  const monthlyBreakdown = [...selectedKeys].sort().map((key) => {
    const [year, month] = key.split("-").map(Number);
    const tax = taxByMonth.get(key) || { provisional: 0, actual: 0, actualCount: 0 };
    const settlement = settlementByMonth.get(key);
    const provisionalWht = settlement ? settlement.provisional : tax.provisional;
    const actualWht = settlement?.actualCount ? settlement.actual : tax.actual;
    const actualCount = settlement?.actualCount || tax.actualCount;
    const rejected = settlement ? settlement.rejected : (claimsByMonth.get(key) || 0);
    const effectiveWht = actualCount > 0 ? actualWht : provisionalWht;
    const whtBasis = actualCount > 0 ? "actual" as const : effectiveWht > 0 ? "provisional" as const : "none" as const;
    return { year, month, rejected, provisionalWht, actualWht, effectiveWht, whtBasis };
  });

  for (const row of monthlyBreakdown) {
    if ([row.rejected, row.provisionalWht, row.actualWht, row.effectiveWht]
      .some((value) => !Number.isFinite(value) || value < 0)) {
      throw new Error("Claims or withholding-tax totals contain an invalid amount; statement generation was stopped.");
    }
  }

  return {
    rejectedClaimsTotal: monthlyBreakdown.reduce((sum, row) => sum + row.rejected, 0),
    provisionalWhtTotal: monthlyBreakdown.reduce((sum, row) => sum + row.provisionalWht, 0),
    actualWhtTotal: monthlyBreakdown.reduce((sum, row) => sum + row.actualWht, 0),
    effectiveWhtTotal: monthlyBreakdown.reduce((sum, row) => sum + row.effectiveWht, 0),
    monthlyBreakdown,
  };
}

