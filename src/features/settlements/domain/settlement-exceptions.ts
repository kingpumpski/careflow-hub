import type { ClaimsSettlementPeriod, SettlementStatus } from './settlement';
import { calculateExplicitAdviceReconciliation } from './settlement';

export type SettlementExceptionType =
  | 'payment_variance'
  | 'rejection_variance'
  | 'withholding_tax_variance'
  | 'missing_payment_advice'
  | 'incomplete_payment_advice'
  | 'overdue_settlement';

export type SettlementExceptionPeriodSource = {
  id?: string;
  facility_id?: string;
  period_end?: string | null;
  total_claims_submitted?: number | string | null;
  settlement_status?: SettlementStatus;
  payment_received?: number | string | null;
  rejection_amount?: number | string | null;
  approved_gross_amount?: number | string | null;
  actual_withholding_tax?: number | string | null;
  withholding_tax_variance?: number | string | null;
  payment_advice_reference?: string | null;
  payment_advice_date?: string | null;
};

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
};

const EPSILON = 0.005;
export const SETTLEMENT_OVERDUE_DAYS = 30;

function daysSincePeriodEnd(periodEnd: string, asOf: Date): number {
  const periodEndTime = new Date(`${periodEnd}T23:59:59`).getTime();
  if (!Number.isFinite(periodEndTime)) return 0;
  return Math.floor(Math.max(0, asOf.getTime() - periodEndTime) / 86_400_000);
}

export function detectSettlementExceptions(
  period: Pick<ClaimsSettlementPeriod, 'id' | 'facilityId' | 'periodEnd' | 'totalClaimsSubmitted' | 'settlementStatus' | 'paymentReceived' | 'rejectionAmount' | 'approvedGrossAmount' | 'actualWithholdingTax' | 'withholdingTaxVariance' | 'paymentAdviceReference' | 'paymentAdviceDate'>,
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

  if (period.approvedGrossAmount == null || period.paymentReceived === null || period.rejectionAmount === null || period.actualWithholdingTax === null || !period.paymentAdviceReference?.trim() || !period.paymentAdviceDate) {
    exceptions.push({ facilityId: period.facilityId, settlementPeriodId: period.id, type: 'incomplete_payment_advice', severity: 'critical', title: 'Payment advice is incomplete', description: 'The period is marked as advice received but approved gross, rejection, actual WHT, net cash, advice reference or advice date is missing.', detectedAt });
  }

  if (period.withholdingTaxVariance !== null && Math.abs(period.withholdingTaxVariance) > EPSILON) {
    exceptions.push({ facilityId: period.facilityId, settlementPeriodId: period.id, type: 'withholding_tax_variance', severity: Math.abs(period.withholdingTaxVariance) >= 100 ? 'critical' : 'warning', title: 'WHT variance detected', description: `Confirmed actual WHT differs from provisional WHT by ${period.withholdingTaxVariance.toFixed(2)}.`, detectedAt });
  }

  // Never infer insurer-approved gross from submitted less rejected or from cash + WHT.
  // The two reconciliation checks are independent and use the insurer-stated approved value.
  if (period.approvedGrossAmount != null
    && period.paymentReceived !== null
    && period.rejectionAmount !== null
    && period.actualWithholdingTax !== null) {
    const reconciliation = calculateExplicitAdviceReconciliation({
      submittedAmount: period.totalClaimsSubmitted,
      approvedGrossAmount: period.approvedGrossAmount,
      rejectedAmount: period.rejectionAmount,
      actualWithholdingTax: period.actualWithholdingTax,
      netCashReceived: period.paymentReceived,
    });

    if (reconciliation.approvalVariance !== null && Math.abs(reconciliation.approvalVariance) > EPSILON) {
      const magnitude = Math.abs(reconciliation.approvalVariance);
      exceptions.push({
        facilityId: period.facilityId,
        settlementPeriodId: period.id,
        type: 'rejection_variance',
        severity: magnitude >= 100 ? 'critical' : 'warning',
        title: 'Insurer approval variance detected',
        description: `Submitted gross minus insurer-reported approved gross and confirmed rejected gross leaves a signed variance of ${reconciliation.approvalVariance.toFixed(2)}.`,
        detectedAt,
      });
    }

    if (reconciliation.approvedUnpaidBalance !== null && Math.abs(reconciliation.approvedUnpaidBalance) > EPSILON) {
      const balance = reconciliation.approvedUnpaidBalance;
      const magnitude = Math.abs(balance);
      const direction = balance > 0 ? 'under-settlement' : 'over-settlement';
      exceptions.push({
        facilityId: period.facilityId,
        settlementPeriodId: period.id,
        type: 'payment_variance',
        severity: magnitude >= 100 ? 'critical' : 'warning',
        title: `Approved claims ${direction} detected`,
        description: `Insurer-approved gross minus confirmed actual WHT and net cash received leaves a signed balance of ${balance.toFixed(2)}.`,
        detectedAt,
      });
    }
  }

  return exceptions;
}

export function canChangeSettlementExceptionStatus(current: SettlementExceptionStatus, next: SettlementExceptionStatus): boolean {
  return current === next
    || (current === 'open' && next === 'under_review')
    || (current === 'open' && next === 'waived')
    || (current === 'under_review' && (next === 'resolved' || next === 'waived'));
}
