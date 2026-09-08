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

const roundCurrency = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

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

export function isSettlementConfirmed(status: SettlementStatus): boolean {
  return status === 'payment_advice_received' || status === 'reconciled';
}
