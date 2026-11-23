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
  const startMatch = /^(\\d{4})-(\\d{2})-01$/.exec(periodStart);
  const endMatch = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(periodEnd);
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
