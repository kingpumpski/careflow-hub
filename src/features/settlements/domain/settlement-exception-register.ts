import type { ClaimsSettlementPeriod } from './settlement';

export type SettlementExceptionStatus = 'open' | 'under_review' | 'resolved' | 'waived';
export type SettlementExceptionType = 'overdue_settlement' | 'missing_payment_advice' | 'incomplete_payment_advice' | 'withholding_tax_variance';
export type SettlementExceptionSeverity = 'info' | 'warning' | 'critical';

export interface SettlementException {
  id: string;
  facilityId: string;
  settlementPeriodId: string;
  type: SettlementExceptionType;
  severity: SettlementExceptionSeverity;
  status: SettlementExceptionStatus;
  title: string;
  reason: string;
  officerNotes: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface SettlementExceptionAuditEvent {
  id: string;
  facilityId: string;
  exceptionId: string;
  action: 'created' | 'status_changed' | 'note_added' | 'resolved' | 'waived';
  actorId: string;
  occurredAt: string;
  beforeStatus: SettlementExceptionStatus | null;
  afterStatus: SettlementExceptionStatus | null;
  details: string;
}

const dayMs = 86_400_000;

export function detectSettlementExceptions(period: ClaimsSettlementPeriod, now = new Date()): Array<Omit<SettlementException, 'id' | 'createdAt' | 'updatedAt'>> {
  const results: Array<Omit<SettlementException, 'id' | 'createdAt' | 'updatedAt'>> = [];
  const base = { facilityId: period.facilityId, settlementPeriodId: period.id, status: 'open' as const, officerNotes: null, resolution: null, resolvedAt: null, resolvedBy: null };
  if (period.settlementStatus === 'awaiting_payment' && now.getTime() > new Date(period.periodEnd).getTime() + dayMs * 30) {
    results.push({ ...base, type: 'overdue_settlement', severity: 'critical', title: 'Settlement is overdue', reason: 'The settlement period has remained awaiting payment for more than 30 days after its end date.' });
  }
  if (period.settlementStatus === 'awaiting_payment' && now.getTime() > new Date(period.periodEnd).getTime()) {
    results.push({ ...base, type: 'missing_payment_advice', severity: 'warning', title: 'Payment advice is missing', reason: 'The settlement period has ended but payment advice has not been recorded.' });
  }
  if (period.settlementStatus === 'payment_advice_received' && (!period.paymentAdviceReference?.trim() || !period.paymentAdviceDate || period.paymentReceived == null || period.rejectionAmount == null || period.actualWithholdingTax == null)) {
    results.push({ ...base, type: 'incomplete_payment_advice', severity: 'critical', title: 'Payment advice is incomplete', reason: 'The period is marked as advice received but one or more required confirmed advice fields are missing.' });
  }
  if (period.actualWithholdingTax != null && period.withholdingTaxVariance != null && period.withholdingTaxVariance !== 0) {
    results.push({ ...base, type: 'withholding_tax_variance', severity: 'warning', title: 'Withholding tax variance requires review', reason: `Confirmed actual WHT differs from the provisional estimate by ${period.withholdingTaxVariance.toFixed(2)}.` });
  }
  return results;
}

export function canTransitionSettlementException(current: SettlementExceptionStatus, next: SettlementExceptionStatus): boolean {
  return (current === next)
    || (current === 'open' && next === 'under_review')
    || (current === 'under_review' && (next === 'resolved' || next === 'waived'));
}
