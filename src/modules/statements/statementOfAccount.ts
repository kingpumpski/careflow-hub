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
 * Builds an Accounts Receivable sub-ledger statement for one insurer.
 * Journal rows are included only when Accounts Receivable is one side of
 * the posting; WHT control/expense postings remain in their separate tax
 * ledger and are not incorrectly presented as company receivables.
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

  const beforePeriod = relevant.filter(({ entry }) => entry.entry_date < startDate);
  const openingBalance = beforePeriod.reduce((sum, row) => sum + row.debit - row.credit, 0);
  const periodRows = relevant.filter(({ entry }) => entry.entry_date >= startDate && entry.entry_date <= endDate);
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

export type StatementClaimsPeriod = {
  period_year: number;
  period_month: number;
  rejected_amount: number | string | null;
  provisional_withholding_tax_amount: number | string | null;
  actual_withholding_tax_amount: number | string | null;
  withholding_tax_amount: number | string | null;
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
  }>;
};

/**
 * The statement period is date-based for ledger lines and claim-month-based
 * for monthly claim/WHT summaries. A claim month is included when it overlaps
 * the selected date range. Effective WHT follows the authoritative view:
 * actual WHT replaces provisional WHT when confirmed; the two are never added.
 */
export function buildStatementReconciliation(
  rows: StatementClaimsPeriod[],
  startDate: string,
  endDate: string,
): StatementReconciliation {
  if (!startDate || !endDate || startDate > endDate) {
    throw new Error("Enter a valid statement period for claims and tax totals.");
  }
  const selected = rows
    .filter((row) => {
      const monthStart = `${row.period_year}-${String(row.period_month).padStart(2, "0")}-01`;
      const monthEnd = new Date(Date.UTC(row.period_year, row.period_month, 0)).toISOString().slice(0, 10);
      return monthStart <= endDate && monthEnd >= startDate;
    })
    .map((row) => ({
      year: Number(row.period_year),
      month: Number(row.period_month),
      rejected: Number(row.rejected_amount || 0),
      provisionalWht: Number(row.provisional_withholding_tax_amount || 0),
      actualWht: Number(row.actual_withholding_tax_amount || 0),
      effectiveWht: Number(row.withholding_tax_amount || 0),
    }));
  for (const row of selected) {
    if ([row.rejected, row.provisionalWht, row.actualWht, row.effectiveWht].some((value) => !Number.isFinite(value) || value < 0)) {
      throw new Error("Claims or withholding-tax totals contain an invalid amount; statement generation was stopped.");
    }
  }
  return {
    rejectedClaimsTotal: selected.reduce((sum, row) => sum + row.rejected, 0),
    provisionalWhtTotal: selected.reduce((sum, row) => sum + row.provisionalWht, 0),
    actualWhtTotal: selected.reduce((sum, row) => sum + row.actualWht, 0),
    effectiveWhtTotal: selected.reduce((sum, row) => sum + row.effectiveWht, 0),
    monthlyBreakdown: selected.sort((a, b) => a.year - b.year || a.month - b.month),
  };
}
