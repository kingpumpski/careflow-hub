export type SettlementStatus =
  | 'awaiting_payment'
  | 'payment_advice_received'
  | 'reconciled';

export type SettlementVarianceDirection = 'balanced' | 'under_settlement' | 'over_settlement';

export interface ClaimsSettlementPeriod {
  id: string;
  facilityId: string;
  insuranceCompanyId: string;
  periodStart: string;
  periodEnd: string;
  periodType: 'month' | 'quarter' | 'custom';
  totalClaimsSubmitted: number;
  withholdingTaxRate: number;
  provisionalWithholdingTax: number;
  paymentReceived: number | null;
  rejectionAmount: number | null;
  actualWithholdingTax: number | null;
  paymentAdviceReference: string | null;
  paymentAdviceDate: string | null;
  settlementStatus: SettlementStatus;
  withholdingTaxVariance: number | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
}

export interface SettlementReconciliationResult {
  submitted: number;
  rejected: number;
  paymentReceived: number;
  actualWithholdingTax: number;
  residual: number;
  outstanding: number;
  overSettled: number;
  direction: SettlementVarianceDirection;
  balanced: boolean;
}

const EPSILON = 0.005;

/** Parse a staff-entered, approved WHT rate. Missing values must never become an assumed rate. */
export function parseApprovedWithholdingTaxRate(input: string): number {
  if (!input.trim()) throw new Error('An approved withholding tax rate is required.');
  const rate = Number(input);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new Error('Withholding tax rate must be between 0 and 100.');
  }
  return rate;
}

const roundCurrency = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

/** Monthly settlement periods must align to a complete calendar month. */
export function isFullCalendarMonth(periodStart: string, periodEnd: string): boolean {
  const startMatch = /^(\d{4})-(\d{2})-01$/.exec(periodStart);
  const endMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(periodEnd);
  if (!startMatch || !endMatch) return false;

  const [, startYear, startMonth] = startMatch;
  const [, endYear, endMonth, endDay] = endMatch;
  if (startYear !== endYear || startMonth !== endMonth) return false;

  const year = Number(startYear);
  const month = Number(startMonth);
  if (month < 1 || month > 12) return false;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Number(endDay) === lastDay;
}

/**
 * Returns the gross amount approved by the insurer after confirmed rejections.
 * Rejections are kept separate from the original submitted amount and never
 * mutate the provisional WHT estimate.
 */
export function calculateApprovedClaimAmount(
  totalClaimsSubmitted: number,
  rejectionAmount: number,
): number {
  if (!Number.isFinite(totalClaimsSubmitted) || totalClaimsSubmitted < 0) {
    throw new Error('Total claims submitted must be a non-negative number.');
  }
  if (!Number.isFinite(rejectionAmount) || rejectionAmount < 0) {
    throw new Error('Rejection amount must be a non-negative number.');
  }
  if (rejectionAmount > totalClaimsSubmitted) {
    throw new Error('Rejection amount cannot exceed the total claims submitted.');
  }

  return roundCurrency(totalClaimsSubmitted - rejectionAmount);
}

/**
 * Calculates expected actual WHT from the insurer-approved gross amount.
 * Call only when payment advice has been received; this is not the provisional
 * estimate calculated at claim submission.
 */
export function calculateActualWithholdingTax(
  totalClaimsSubmitted: number,
  rejectionAmount: number,
  withholdingTaxRate: number,
): number {
  if (!Number.isFinite(withholdingTaxRate) || withholdingTaxRate < 0 || withholdingTaxRate > 100) {
    throw new Error('Withholding tax rate must be between 0 and 100.');
  }

  const approvedAmount = calculateApprovedClaimAmount(totalClaimsSubmitted, rejectionAmount);
  return roundCurrency((approvedAmount * withholdingTaxRate) / 100);
}

const finiteAmount = (value: number | null): number =>
  value === null ? 0 : Number(value);

/**
 * Calculates an estimate only. It must never be used as the confirmed WHT value.
 */
export function calculateProvisionalWithholdingTax(
  totalClaimsSubmitted: number,
  withholdingTaxRate: number,
): number {
  if (!Number.isFinite(totalClaimsSubmitted) || totalClaimsSubmitted < 0) {
    throw new Error('Total claims submitted must be a non-negative number.');
  }

  if (!Number.isFinite(withholdingTaxRate) || withholdingTaxRate < 0 || withholdingTaxRate > 100) {
    throw new Error('Withholding tax rate must be between 0 and 100.');
  }

  return roundCurrency((totalClaimsSubmitted * withholdingTaxRate) / 100);
}

/**
 * Compares the confirmed payment-advice WHT against the period estimate.
 * A null result means the external settlement has not confirmed actual WHT yet.
 */
export function calculateWithholdingTaxVariance(
  provisionalWithholdingTax: number,
  actualWithholdingTax: number | null,
): number | null {
  if (actualWithholdingTax === null) return null;

  if (!Number.isFinite(provisionalWithholdingTax) || provisionalWithholdingTax < 0) {
    throw new Error('Provisional withholding tax must be a non-negative number.');
  }

  if (!Number.isFinite(actualWithholdingTax) || actualWithholdingTax < 0) {
    throw new Error('Actual withholding tax must be a non-negative number.');
  }

  return roundCurrency(actualWithholdingTax - provisionalWithholdingTax);
}

/**
 * Reconciles a settlement using confirmed advice only.
 * Canonical residual = submitted - rejected - payment - actual WHT.
 * Positive residual means the insurer has not fully settled the eligible amount;
 * negative residual means confirmed receipts exceed that amount and require review.
 */
export function calculateSettlementReconciliation(
  totalClaimsSubmitted: number,
  rejectionAmount: number | null,
  paymentReceived: number | null,
  actualWithholdingTax: number | null,
): SettlementReconciliationResult {
  if (!Number.isFinite(totalClaimsSubmitted) || totalClaimsSubmitted < 0) {
    throw new Error('Total claims submitted must be a non-negative number.');
  }

  const values = [rejectionAmount, paymentReceived, actualWithholdingTax];
  if (values.some((value) => value !== null && (!Number.isFinite(value) || value < 0))) {
    throw new Error('Settlement amounts must be null or non-negative numbers.');
  }

  const submitted = roundCurrency(totalClaimsSubmitted);
  const rejected = roundCurrency(finiteAmount(rejectionAmount));
  const payment = roundCurrency(finiteAmount(paymentReceived));
  const actualWht = roundCurrency(finiteAmount(actualWithholdingTax));
  const residual = roundCurrency(submitted - rejected - payment - actualWht);
  const balanced = Math.abs(residual) <= EPSILON;

  return {
    submitted,
    rejected,
    paymentReceived: payment,
    actualWithholdingTax: actualWht,
    residual,
    outstanding: Math.max(0, residual),
    overSettled: Math.max(0, -residual),
    direction: balanced ? 'balanced' : residual > 0 ? 'under_settlement' : 'over_settlement',
    balanced,
  };
}

export function isSettlementConfirmed(status: SettlementStatus): boolean {
  return status === 'payment_advice_received' || status === 'reconciled';
}

/**
 * Reconciliation is an explicit operational confirmation after payment advice
 * has been entered. It cannot be performed while the period is still awaiting payment.
 */
export function canReconcileSettlement(period: Pick<ClaimsSettlementPeriod, 'settlementStatus' | 'paymentReceived' | 'rejectionAmount' | 'actualWithholdingTax' | 'paymentAdviceReference' | 'paymentAdviceDate'>): boolean {
  return period.settlementStatus === 'payment_advice_received'
    && period.paymentReceived !== null
    && period.rejectionAmount !== null
    && period.actualWithholdingTax !== null
    && Boolean(period.paymentAdviceReference?.trim())
    && Boolean(period.paymentAdviceDate);
}


/**
 * One insurer advice/remittance event linked to the claims cycle it settles.
 * adviceDate and receiptDate are deliberately separate: advice may be issued
 * in one month and cash may arrive in another. Amounts are incremental for
 * this event (not cumulative statement balances).
 */
export interface ClaimsCycleRemittance {
  adviceReference: string;
  adviceDate: string;
  receiptDate: string | null;
  approvedAmount: number;
  rejectedAmount: number;
  actualWithholdingTax: number;
  netCashReceived: number;
}

export interface ClaimsCycleReconciliation {
  claimsPeriod: string;
  submittedAmount: number;
  provisionalWithholdingTax: number;
  approvedAmount: number;
  rejectedAmount: number;
  actualWithholdingTax: number;
  netCashReceived: number;
  approvalVariance: number;
  approvedUnpaidBalance: number;
  overallVariance: number;
  receiptMonthTotals: Array<{
    receiptMonth: string;
    netCashReceived: number;
    actualWithholdingTax: number;
    remittanceCount: number;
  }>;
  balanced: boolean;
}

/**
 * Matches remittances to their originating claims cycle, regardless of the
 * later advice/receipt month. The caller must scope cycles by facility and
 * insurer before calling this function. Duplicate advice references are
 * rejected to prevent accidental double counting.
 *
 * submitted = approved + rejected + approval variance
 * approved = actual WHT + net cash + approved unpaid balance
 *
 * Provisional WHT remains a separate estimate on the original submitted
 * amount and is never substituted for or added to actual WHT.
 */
export function reconcileClaimsCycle(input: {
  claimsPeriod: string;
  submittedAmount: number;
  provisionalWithholdingTax: number;
  remittances: ClaimsCycleRemittance[];
}): ClaimsCycleReconciliation {
  const { claimsPeriod, submittedAmount, provisionalWithholdingTax, remittances } = input;
  const nonNegative = [submittedAmount, provisionalWithholdingTax];
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(claimsPeriod)) {
    throw new Error('Claims period must use YYYY-MM format.');
  }
  if (nonNegative.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Submitted amount and provisional WHT must be non-negative.');
  }

  const references = new Set<string>();
  for (const item of remittances) {
    if (!item.adviceReference.trim() || references.has(item.adviceReference.trim())) {
      throw new Error('Each remittance must have a unique, non-empty advice reference.');
    }
    references.add(item.adviceReference.trim());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.adviceDate)
      || (item.receiptDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(item.receiptDate))) {
      throw new Error('Advice and receipt dates must use YYYY-MM-DD format.');
    }
    if ([item.approvedAmount, item.rejectedAmount, item.actualWithholdingTax, item.netCashReceived]
      .some((value) => !Number.isFinite(value) || value < 0)) {
      throw new Error('Remittance amounts must be non-negative.');
    }
  }

  const sum = (key: 'approvedAmount' | 'rejectedAmount' | 'actualWithholdingTax' | 'netCashReceived') =>
    roundCurrency(remittances.reduce((total, item) => total + item[key], 0));
  const approvedAmount = sum('approvedAmount');
  const rejectedAmount = sum('rejectedAmount');
  const actualWithholdingTax = sum('actualWithholdingTax');
  const netCashReceived = sum('netCashReceived');
  const approvalVariance = roundCurrency(submittedAmount - approvedAmount - rejectedAmount);
  const approvedUnpaidBalance = roundCurrency(approvedAmount - actualWithholdingTax - netCashReceived);
  const overallVariance = roundCurrency(submittedAmount - rejectedAmount - actualWithholdingTax - netCashReceived);

  const receiptMonths = new Map<string, { netCashReceived: number; actualWithholdingTax: number; remittanceCount: number }>();
  for (const item of remittances) {
    if (!item.receiptDate) continue;
    const month = item.receiptDate.slice(0, 7);
    const current = receiptMonths.get(month) ?? { netCashReceived: 0, actualWithholdingTax: 0, remittanceCount: 0 };
    current.netCashReceived = roundCurrency(current.netCashReceived + item.netCashReceived);
    current.actualWithholdingTax = roundCurrency(current.actualWithholdingTax + item.actualWithholdingTax);
    current.remittanceCount += 1;
    receiptMonths.set(month, current);
  }

  return {
    claimsPeriod,
    submittedAmount: roundCurrency(submittedAmount),
    provisionalWithholdingTax: roundCurrency(provisionalWithholdingTax),
    approvedAmount,
    rejectedAmount,
    actualWithholdingTax,
    netCashReceived,
    approvalVariance,
    approvedUnpaidBalance,
    overallVariance,
    receiptMonthTotals: [...receiptMonths.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([receiptMonth, totals]) => ({ receiptMonth, ...totals })),
    balanced: Math.abs(approvalVariance) <= EPSILON && Math.abs(approvedUnpaidBalance) <= EPSILON,
  };
}
