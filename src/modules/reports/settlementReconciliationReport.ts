export type SettlementReconciliationSource = {
  id: string;
  insurance_company_id: string;
  period_start: string;
  period_end: string;
  total_claims_submitted: number | string | null;
  approved_gross_amount?: number | string | null;
  provisional_withholding_tax?: number | string | null;
  rejection_amount?: number | string | null;
  actual_withholding_tax?: number | string | null;
  payment_received?: number | string | null;
  settlement_status: string;
  payment_advice_reference?: string | null;
  payment_advice_date?: string | null;
  actual_receipt_date?: string | null;
};

export type SettlementReconciliationRow = {
  id: string;
  insuranceCompanyId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  submitted: number;
  approvedGross: number | null;
  rejected: number | null;
  provisionalWht: number;
  actualWht: number | null;
  cashReceived: number | null;
  approvalVariance: number | null;
  approvedUnpaid: number | null;
  adviceReference: string | null;
  adviceDate: string | null;
  receiptDate: string | null;
};

const amount = (value: number | string | null | undefined): number | null => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function buildSettlementReconciliationRows(
  periods: readonly SettlementReconciliationSource[],
): SettlementReconciliationRow[] {
  return periods.map((period) => {
    const submitted = amount(period.total_claims_submitted) ?? 0;
    const approvedGross = amount(period.approved_gross_amount);
    const rejected = amount(period.rejection_amount);
    const actualWht = amount(period.actual_withholding_tax);
    const cashReceived = amount(period.payment_received);
    const provisionalWht = amount(period.provisional_withholding_tax) ?? 0;
    const hasConfirmedAdvice = period.settlement_status !== "awaiting_payment"
      && approvedGross !== null && rejected !== null && actualWht !== null && cashReceived !== null;
    return {
      id: period.id,
      insuranceCompanyId: period.insurance_company_id,
      periodStart: period.period_start,
      periodEnd: period.period_end,
      status: period.settlement_status,
      submitted,
      approvedGross,
      rejected,
      provisionalWht,
      actualWht,
      cashReceived,
      approvalVariance: approvedGross === null || rejected === null
        ? null
        : (Math.round((submitted - approvedGross - rejected) * 100) || 0) / 100,
      approvedUnpaid: !hasConfirmedAdvice
        ? null
        : (Math.round((approvedGross! - actualWht! - cashReceived!) * 100) || 0) / 100,
      adviceReference: period.payment_advice_reference ?? null,
      adviceDate: period.payment_advice_date ?? null,
      receiptDate: period.actual_receipt_date ?? null,
    };
  }).sort((a, b) => b.periodStart.localeCompare(a.periodStart)
    || a.insuranceCompanyId.localeCompare(b.insuranceCompanyId));
}

export function summarizeSettlementReconciliationRows(rows: readonly SettlementReconciliationRow[]) {
  return rows.reduce((summary, row) => {
    summary.periodCount += 1;
    if (row.status === "awaiting_payment") summary.awaitingPaymentCount += 1;
    else summary.adviceReceivedCount += 1;
    summary.submitted += row.submitted;
    summary.provisionalWht += row.provisionalWht;
    if (row.approvedGross !== null) { summary.approvedGross += row.approvedGross; summary.approvedGrossCount += 1; }
    if (row.rejected !== null) { summary.rejected += row.rejected; summary.rejectedCount += 1; }
    if (row.actualWht !== null) { summary.actualWht += row.actualWht; summary.actualWhtCount += 1; }
    if (row.cashReceived !== null) { summary.cashReceived += row.cashReceived; summary.cashReceivedCount += 1; }
    if (row.approvalVariance !== null) { summary.approvalVariance += row.approvalVariance; summary.approvalVarianceCount += 1; }
    if (row.approvedUnpaid !== null) {
      summary.approvedUnpaidCount += 1;
      if (row.approvedUnpaid > 0.005) summary.approvedUnpaid += row.approvedUnpaid;
      if (row.approvedUnpaid < -0.005) summary.overSettled += Math.abs(row.approvedUnpaid);
      if (Math.abs(row.approvedUnpaid) <= 0.005) summary.balancedCount += 1;
    }
    return summary;
  }, {
    periodCount: 0, awaitingPaymentCount: 0, adviceReceivedCount: 0,
    submitted: 0, approvedGross: 0, rejected: 0, provisionalWht: 0,
    actualWht: 0, cashReceived: 0, approvalVariance: 0,
    approvedUnpaid: 0, overSettled: 0, balancedCount: 0,
  });
}
