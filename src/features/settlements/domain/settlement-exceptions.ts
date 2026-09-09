import type { ClaimsSettlementPeriod } from './settlement';

export type SettlementExceptionType =
  | 'payment_variance'
  | 'rejection_variance'
  | 'withholding_tax_variance'
  | 'missing_payment_advice'
  | 'incomplete_payment_advice'
  | 'overdue_settlement';

export type SettlementExceptionSeverity = 'info' | 'warning' | 'critical';
export type SettlementExceptionStatus = 'open' | 'under_review' | 'resolved' | 'waived';

export type SettlementException = {
  id: string;
  facilityId: string;
  settlementPeriodId: string;
  type: SettlementExceptionType;
  severity: SettlementExceptionSeverity;
  status: SettlementExceptionStatus;
  title: string;
  description: string;
  detectedAt: string;
  assignedTo: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

const EPSILON = 0.005;
export const SETTLEMENT_OVERDUE_DAYS = 30;

function daysSincePeriodEnd(periodEnd: string, asOf: Date): number {
  const periodEndTime = new Date(`${periodEnd}T23:59:59`).getTime();
  if (!Number.isFinite(periodEndTime)) return 0;
  return Math.floor(Math.max(0, asOf.getTime() - periodEndTime) / 86_400_000);
}

export function detectSettlementExceptions(
  period: Pick<ClaimsSettlementPeriod, 'id' | 'facilityId' | 'periodEnd' | 'settlementStatus' | 'paymentReceived' | 'rejectionAmount' | 'actualWithholdingTax' | 'withholdingTaxVariance' | 'paymentAdviceReference' | 'paymentAdviceDate'>,
  asOf = new Date(),
): Array<Omit<SettlementException, 'id' | 'status' | 'assignedTo' | 'resolutionNote' | 'resolvedAt' | 'resolvedBy'>> {
  const detectedAt = asOf.toISOString();
  const exceptions: Array<Omit<SettlementException, 'id' | 'status' | 'assignedTo' | 'resolutionNote' | 'resolvedAt' | 'resolvedBy'>> = [];
  const overdue = period.settlementStatus === 'awaiting_payment' && daysSincePeriodEnd(period.periodEnd, asOf) >= SETTLEMENT_OVERDUE_DAYS;

  if (overdue) {
    exceptions.push({ facilityId: period.facilityId, settlementPeriodId: period.id, type: 'overdue_settlement', severity: 'warning', title: 'Settlement is overdue', description: `No payment advice has been recorded ${SETTLEMENT_OVERDUE_DAYS} or more days after the period end.`, detectedAt });
  }

  if (period.settlementStatus === 'awaiting_payment') {
    exceptions.push({ facilityId: period.facilityId, settlementPeriodId: period.id, type: 'missing_payment_advice', severity: overdue ? 'critical' : 'info', title: 'Payment advice pending', description: 'The settlement remains awaiting payment advice from the external claims/payment source.', detectedAt });
    return exceptions;
  }

  if (period.paymentReceived === null || period.rejectionAmount === null || period.actualWithholdingTax === null || !period.paymentAdviceReference?.trim() || !period.paymentAdviceDate) {
    exceptions.push({ facilityId: period.facilityId, settlementPeriodId: period.id, type: 'incomplete_payment_advice', severity: 'critical', title: 'Payment advice is incomplete', description: 'The period is marked as advice received but required confirmed advice fields are missing.', detectedAt });
  }

  if (period.withholdingTaxVariance !== null && Math.abs(period.withholdingTaxVariance) > EPSILON) {
    exceptions.push({ facilityId: period.facilityId, settlementPeriodId: period.id, type: 'withholding_tax_variance', severity: Math.abs(period.withholdingTaxVariance) >= 100 ? 'critical' : 'warning', title: 'WHT variance detected', description: `Confirmed actual WHT differs from provisional WHT by ${period.withholdingTaxVariance.toFixed(2)}.`, detectedAt });
  }

  return exceptions;
}

export function canChangeSettlementExceptionStatus(current: SettlementExceptionStatus, next: SettlementExceptionStatus): boolean {
  return current === next
    || (current === 'open' && next === 'under_review')
    || (current === 'open' && next === 'waived')
    || (current === 'under_review' && (next === 'resolved' || next === 'waived'));
}
