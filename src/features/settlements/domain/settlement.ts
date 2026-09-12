export type SettlementStatus =
  | 'awaiting_payment'
  | 'payment_advice_received'
  | 'reconciled';

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
  balanced: boolean;
}

const EPSILON = 0.005;

const roundCurrency = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

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
 * `outstanding` is clamped at zero for receivable-style reporting; `residual`
 * remains signed so under/over-settlement can be investigated rather than hidden.
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

  return {
    submitted,
    rejected,
    paymentReceived: payment,
    actualWithholdingTax: actualWht,
    residual,
    outstanding: Math.max(0, residual),
    balanced: Math.abs(residual) <= EPSILON,
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
