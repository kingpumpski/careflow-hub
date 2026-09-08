import type { ClaimsSettlementPeriod } from './settlement';

export type SettlementExceptionType =
  | 'payment_variance'
  | 'rejection_variance'
  | 'withholding_tax_variance'
  | 'missing_payment_advice'
  | 'overdue_settlement';

export type SettlementExceptionSeverity = 'info' | 'warning' | 'critical';

export interface SettlementException {
  type: SettlementExceptionType;
  severity: SettlementExceptionSeverity;
  title: string;
  description: string;
  periodId: string;
}

const EPSILON = 0.005;

export function detectSettlementExceptions(
  period: Pick<ClaimsSettlementPeriod, 'id' | 'periodEnd' | 'settlementStatus' | 'paymentReceived' | 'rejectionAmount' | 'actualWithholdingTax' | 'provisionalWithholdingTax' | 'withholdingTaxVariance' | 'paymentAdviceReference' | 'paymentAdviceDate'>,
  asOf = new Date(),
): SettlementException[] {
  const exceptions: SettlementException[] = [];
  const base = { periodId: period.id };

  if (period.settlementStatus === 'awaiting_payment') {
    const periodEnd = new Date(`${period.periodEnd}T23:59:59`);
    if (Number.isFinite(periodEnd.getTime()) && asOf.getTime() > periodEnd.getTime()) {
      exceptions.push({ ...base, type: 'overdue_settlement', severity: 'warning', title: 'Settlement is overdue', description: 'The settlement period has ended but payment advice has not been recorded.' });
    }
    exceptions.push({ ...base, type: 'missing_payment_advice', severity: 'info', title: 'Payment advice pending', description: 'Payment, rejection, actual WHT, advice reference and advice date have not yet been confirmed.' });
    return exceptions;
  }

  if (period.paymentReceived === null || period.rejectionAmount === null || period.actualWithholdingTax === null || !period.paymentAdviceReference?.trim() || !period.paymentAdviceDate) {
    exceptions.push({ ...base, type: 'missing_payment_advice', severity: 'critical', title: 'Payment advice is incomplete', description: 'A confirmed settlement is missing one or more required payment-advice fields.' });
  }

  if (period.withholdingTaxVariance !== null && Math.abs(period.withholdingTaxVariance) > EPSILON) {
    exceptions.push({ ...base, type: 'withholding_tax_variance', severity: Math.abs(period.withholdingTaxVariance) >= 100 ? 'critical' : 'warning', title: 'WHT variance detected', description: `Confirmed actual WHT differs from provisional WHT by ${period.withholdingTaxVariance.toFixed(2)}.` });
  }

  return exceptions;
}
