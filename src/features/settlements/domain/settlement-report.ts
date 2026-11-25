import type { ClaimsSettlementPeriod } from './settlement';
import type { SettlementVarianceDirection } from './settlement';
import { addMoney, subtractMoney, toMinorUnits } from '@/modules/platform/decimalMoney';

const REPORT_CURRENCY = 'GHS';

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

/** Add monetary values at currency precision instead of accumulating binary floats. */
const addAmount = (total: number, value: number | null | undefined): number =>
  Number(addMoney(String(total), String(amount(value)), REPORT_CURRENCY));

interface ExactSettlementReconciliation {
  residual: number;
  outstanding: number;
  overSettled: number;
  direction: SettlementVarianceDirection;
  balanced: boolean;
}

const classifyReconciliation = (
  period: ClaimsSettlementPeriod,
): ExactSettlementReconciliation | null => {
  if (period.paymentReceived === null || period.rejectionAmount === null || period.actualWithholdingTax === null) return null;
  const residualText = subtractMoney(
    subtractMoney(
      subtractMoney(String(amount(period.totalClaimsSubmitted)), String(amount(period.rejectionAmount)), REPORT_CURRENCY),
      String(amount(period.paymentReceived)),
      REPORT_CURRENCY,
    ),
    String(amount(period.actualWithholdingTax)),
    REPORT_CURRENCY,
  );
  const residualMinor = toMinorUnits(residualText, REPORT_CURRENCY);
  const zero = 0n;
  const balanced = residualMinor === zero;
  const residual = Number(residualText);
  return {
    residual,
    outstanding: Number(residualMinor > zero ? residualText : '0'),
    overSettled: Number(residualMinor < zero ? subtractMoney('0', residualText, REPORT_CURRENCY) : '0'),
    direction: balanced ? 'balanced' : residualMinor > zero ? 'under_settlement' : 'over_settlement',
    balanced,
  };
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
    summary.totalSubmitted = addAmount(summary.totalSubmitted, period.totalClaimsSubmitted);
    summary.totalPaymentReceived = addAmount(summary.totalPaymentReceived, period.paymentReceived);
    summary.totalRejectionAmount = addAmount(summary.totalRejectionAmount, period.rejectionAmount);
    summary.totalProvisionalWht = addAmount(summary.totalProvisionalWht, period.provisionalWithholdingTax);
    summary.totalActualWht = addAmount(summary.totalActualWht, period.actualWithholdingTax);
    summary.totalWhtVariance = addAmount(summary.totalWhtVariance, period.withholdingTaxVariance);
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
    totalSubmitted: summary.totalSubmitted,
    totalPaymentReceived: summary.totalPaymentReceived,
    totalRejectionAmount: summary.totalRejectionAmount,
    totalProvisionalWht: summary.totalProvisionalWht,
    totalActualWht: summary.totalActualWht,
    totalWhtVariance: summary.totalWhtVariance,
    totalResidual: summary.totalResidual,
    totalOutstanding: summary.totalOutstanding,
    totalOverSettled: summary.totalOverSettled,
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
    current.totalSubmitted = addAmount(current.totalSubmitted, period.totalClaimsSubmitted);
    current.totalPaymentReceived = addAmount(current.totalPaymentReceived, period.paymentReceived);
    current.totalRejectionAmount = addAmount(current.totalRejectionAmount, period.rejectionAmount);
    current.totalWhtVariance = addAmount(current.totalWhtVariance, period.withholdingTaxVariance);

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
    totalSubmitted: row.totalSubmitted,
    totalPaymentReceived: row.totalPaymentReceived,
    totalRejectionAmount: row.totalRejectionAmount,
    totalWhtVariance: row.totalWhtVariance,
    totalResidual: row.totalResidual,
    totalOutstanding: row.totalOutstanding,
    totalOverSettled: row.totalOverSettled,
  })).sort((a, b) => b.totalSubmitted - a.totalSubmitted);
}

export type { SettlementVarianceDirection };
