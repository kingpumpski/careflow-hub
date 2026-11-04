export interface SettlementRateRow {
  submitted_amount: number;
  rejected_amount: number;
  paid_amount: number;
  withholding_tax_amount: number;
  outstanding_amount: number;
}

export interface SettlementRates {
  rejectedPercent: number | null;
  collectionPercent: number | null;
  withholdingTaxPercent: number | null;
  outstandingPercent: number | null;
  submitted: number;
  rejected: number;
  eligible: number;
  paid: number;
  withholdingTax: number;
  outstanding: number;
  periods: number;
}

function amount(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function percentage(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator * 100 : null;
}

export function calculateSettlementRates(rows: SettlementRateRow[]): SettlementRates {
  const totals = rows.reduce((result, row) => ({
    submitted: result.submitted + amount(row.submitted_amount),
    rejected: result.rejected + amount(row.rejected_amount),
    paid: result.paid + amount(row.paid_amount),
    withholdingTax: result.withholdingTax + amount(row.withholding_tax_amount),
    outstanding: result.outstanding + amount(row.outstanding_amount),
  }), { submitted: 0, rejected: 0, paid: 0, withholdingTax: 0, outstanding: 0 });
  const eligible = Math.max(0, totals.submitted - totals.rejected);

  return {
    rejectedPercent: percentage(totals.rejected, totals.submitted),
    collectionPercent: percentage(totals.paid, eligible),
    withholdingTaxPercent: percentage(totals.withholdingTax, eligible),
    outstandingPercent: percentage(totals.outstanding, eligible),
    ...totals,
    eligible,
    periods: rows.length,
  };
}
