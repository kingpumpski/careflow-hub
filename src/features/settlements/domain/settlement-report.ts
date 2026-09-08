import type { ClaimsSettlementPeriod } from './settlement';

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
}

export const SETTLEMENT_REPORT_OVERDUE_DAYS = 30;

const amount = (value: number | null | undefined): number =>
  Number.isFinite(Number(value)) ? Number(value) : 0;

const round = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

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
  return periods.reduce<SettlementReportSummary>((summary, period) => {
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
    overdueCount: 0,
  });
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
    };
    current.periodCount += 1;
    if (period.settlementStatus === 'awaiting_payment') current.awaitingPaymentCount += 1;
    if (period.settlementStatus === 'payment_advice_received') current.adviceReceivedCount += 1;
    if (period.settlementStatus === 'reconciled') current.reconciledCount += 1;
    current.totalSubmitted += amount(period.totalClaimsSubmitted);
    current.totalPaymentReceived += amount(period.paymentReceived);
    current.totalRejectionAmount += amount(period.rejectionAmount);
    current.totalWhtVariance += amount(period.withholdingTaxVariance);
    grouped.set(period.insuranceCompanyId, current);
  }
  return [...grouped.values()].map((row) => ({
    ...row,
    totalSubmitted: round(row.totalSubmitted),
    totalPaymentReceived: round(row.totalPaymentReceived),
    totalRejectionAmount: round(row.totalRejectionAmount),
    totalWhtVariance: round(row.totalWhtVariance),
  })).sort((a, b) => b.totalSubmitted - a.totalSubmitted);
}
