import type { ClaimsSettlementPeriod } from './settlement';
import { calculateSettlementReconciliation, type SettlementVarianceDirection } from './settlement';

export interface SettlementReportSummary {
  periodCount: number;
  awaitingPaymentCount: number;
  adviceReceivedCount: number;
  reconciledCount: number;
  totalSubmitted: number;
  totalPaymentReceived: number;
  totalRejectionAmount: number;
  totalProvisionalWht: number;
  totalActualWht: number;
  totalWhtVariance: number;
  totalResidual: number;
  totalOutstanding: number;
  totalOverSettled: number;
  balancedCount: number;
  underSettledCount: number;
  overSettledCount: number;
  overdueCount: number;
}

export interface SettlementInsurerSummary {
  insurerId: string;
  periodCount: number;
  awaitingPaymentCount: number;
  adviceReceivedCount: number;
  reconciledCount: number;
  totalSubmitted: number;
  totalPaymentReceived: number;
  totalRejectionAmount: number;
  totalWhtVariance: number;
  totalResidual: number;
  totalOutstanding: number;
  totalOverSettled: number;
  balancedCount: number;
  underSettledCount: number;
  overSettledCount: number;
}

export const SETTLEMENT_REPORT_OVERDUE_DAYS = 30;

const amount = (value: number | null | undefined): number =>
  Number.isFinite(Number(value)) ? Number(value) : 0;

const round = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const classifyReconciliation = (
  period: ClaimsSettlementPeriod,
): ReturnType<typeof calculateSettlementReconciliation> | null => {
  if (period.paymentReceived === null || period.rejectionAmount === null || period.actualWithholdingTax === null) return null;
  return calculateSettlementReconciliation(
    amount(period.totalClaimsSubmitted),
    amount(period.rejectionAmount),
    amount(period.paymentReceived),
    amount(period.actualWithholdingTax),
  );
};

export function isSettlementOverdue(
  period: Pick<ClaimsSettlementPeriod, 'settlementStatus' | 'periodEnd'>,
  asOf = new Date(),
): boolean {
  if (period.settlementStatus !== 'awaiting_payment') return false;
  const end = new Date(period.periodEnd);
  if (Number.isNaN(end.getTime())) return false;
  const elapsedDays = (asOf.getTime() - end.getTime()) / 86_400_000;
  return elapsedDays >= SETTLEMENT_REPORT_OVERDUE_DAYS;
}

export function summarizeSettlementPeriods(
  periods: ClaimsSettlementPeriod[],
  asOf = new Date(),
): SettlementReportSummary {
  const summary = periods.reduce<SettlementReportSummary>((summary, period) => {
    summary.periodCount += 1;
    if (period.settlementStatus === 'awaiting_payment') summary.awaitingPaymentCount += 1;
    if (period.settlementStatus === 'payment_advice_received') summary.adviceReceivedCount += 1;
    if (period.settlementStatus === 'reconciled') summary.reconciledCount += 1;
    summary.totalSubmitted += amount(period.totalClaimsSubmitted);
    summary.totalPaymentReceived += amount(period.paymentReceived);
    summary.totalRejectionAmount += amount(period.rejectionAmount);
    summary.totalProvisionalWht += amount(period.provisionalWithholdingTax);
    summary.totalActualWht += amount(period.actualWithholdingTax);
    summary.totalWhtVariance += amount(period.withholdingTaxVariance);
    if (isSettlementOverdue(period, asOf)) summary.overdueCount += 1;

    const reconciliation = classifyReconciliation(period);
    if (reconciliation) {
      summary.totalResidual += reconciliation.residual;
      summary.totalOutstanding += reconciliation.outstanding;
      summary.totalOverSettled += reconciliation.overSettled;
      if (reconciliation.direction === 'balanced') summary.balancedCount += 1;
      if (reconciliation.direction === 'under_settlement') summary.underSettledCount += 1;
      if (reconciliation.direction === 'over_settlement') summary.overSettledCount += 1;
    }
    return summary;
  }, {
    periodCount: 0,
    awaitingPaymentCount: 0,
    adviceReceivedCount: 0,
    reconciledCount: 0,
    totalSubmitted: 0,
    totalPaymentReceived: 0,
    totalRejectionAmount: 0,
    totalProvisionalWht: 0,
    totalActualWht: 0,
    totalWhtVariance: 0,
    totalResidual: 0,
    totalOutstanding: 0,
    totalOverSettled: 0,
    balancedCount: 0,
    underSettledCount: 0,
    overSettledCount: 0,
    overdueCount: 0,
  });

  return {
    ...summary,
    totalSubmitted: round(summary.totalSubmitted),
    totalPaymentReceived: round(summary.totalPaymentReceived),
    totalRejectionAmount: round(summary.totalRejectionAmount),
    totalProvisionalWht: round(summary.totalProvisionalWht),
    totalActualWht: round(summary.totalActualWht),
    totalWhtVariance: round(summary.totalWhtVariance),
    totalResidual: round(summary.totalResidual),
    totalOutstanding: round(summary.totalOutstanding),
    totalOverSettled: round(summary.totalOverSettled),
  };
}

export function summarizeSettlementsByInsurer(
  periods: ClaimsSettlementPeriod[],
): SettlementInsurerSummary[] {
  const grouped = new Map<string, SettlementInsurerSummary>();
  for (const period of periods) {
    const current = grouped.get(period.insuranceCompanyId) ?? {
      insurerId: period.insuranceCompanyId,
      periodCount: 0,
      awaitingPaymentCount: 0,
      adviceReceivedCount: 0,
      reconciledCount: 0,
      totalSubmitted: 0,
      totalPaymentReceived: 0,
      totalRejectionAmount: 0,
      totalWhtVariance: 0,
      totalResidual: 0,
      totalOutstanding: 0,
      totalOverSettled: 0,
      balancedCount: 0,
      underSettledCount: 0,
      overSettledCount: 0,
    };
    current.periodCount += 1;
    if (period.settlementStatus === 'awaiting_payment') current.awaitingPaymentCount += 1;
    if (period.settlementStatus === 'payment_advice_received') current.adviceReceivedCount += 1;
    if (period.settlementStatus === 'reconciled') current.reconciledCount += 1;
    current.totalSubmitted += amount(period.totalClaimsSubmitted);
    current.totalPaymentReceived += amount(period.paymentReceived);
    current.totalRejectionAmount += amount(period.rejectionAmount);
    current.totalWhtVariance += amount(period.withholdingTaxVariance);

    const reconciliation = classifyReconciliation(period);
    if (reconciliation) {
      current.totalResidual += reconciliation.residual;
      current.totalOutstanding += reconciliation.outstanding;
      current.totalOverSettled += reconciliation.overSettled;
      if (reconciliation.direction === 'balanced') current.balancedCount += 1;
      if (reconciliation.direction === 'under_settlement') current.underSettledCount += 1;
      if (reconciliation.direction === 'over_settlement') current.overSettledCount += 1;
    }
    grouped.set(period.insuranceCompanyId, current);
  }
  return [...grouped.values()].map((row) => ({
    ...row,
    totalSubmitted: round(row.totalSubmitted),
    totalPaymentReceived: round(row.totalPaymentReceived),
    totalRejectionAmount: round(row.totalRejectionAmount),
    totalWhtVariance: round(row.totalWhtVariance),
    totalResidual: round(row.totalResidual),
    totalOutstanding: round(row.totalOutstanding),
    totalOverSettled: round(row.totalOverSettled),
  })).sort((a, b) => b.totalSubmitted - a.totalSubmitted);
}

export type { SettlementVarianceDirection };
