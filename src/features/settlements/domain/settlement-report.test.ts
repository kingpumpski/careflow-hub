import { describe, expect, it } from 'vitest';
import { isSettlementOverdue, summarizeSettlementPeriods, summarizeSettlementsByInsurer } from './settlement-report';
import type { ClaimsSettlementPeriod } from './settlement';

const period = (overrides: Partial<ClaimsSettlementPeriod> = {}): ClaimsSettlementPeriod => ({
  id: crypto.randomUUID(),
  facilityId: 'facility-1',
  insuranceCompanyId: 'insurer-1',
  periodStart: '2026-07-01',
  periodEnd: '2026-07-31',
  periodType: 'month',
  totalClaimsSubmitted: 1000,
  withholdingTaxRate: 5,
  provisionalWithholdingTax: 50,
  paymentReceived: null,
  rejectionAmount: null,
  actualWithholdingTax: null,
  paymentAdviceReference: null,
  paymentAdviceDate: null,
  settlementStatus: 'awaiting_payment',
  withholdingTaxVariance: null,
  confirmedBy: null,
  confirmedAt: null,
  ...overrides,
});

describe('settlement reporting', () => {
  it('flags only awaiting-payment periods at or beyond the operational overdue threshold', () => {
    const asOf = new Date('2026-09-01T00:00:00Z');
    expect(isSettlementOverdue(period(), asOf)).toBe(true);
    expect(isSettlementOverdue(period({ settlementStatus: 'reconciled' }), asOf)).toBe(false);
    expect(isSettlementOverdue(period({ periodEnd: '2026-08-10' }), asOf)).toBe(false);
  });

  it('summarizes operational settlement completeness without inventing missing values', () => {
    const rows = [
      period(),
      period({ id: '2', settlementStatus: 'payment_advice_received', paymentReceived: 800, rejectionAmount: 150, actualWithholdingTax: 50, withholdingTaxVariance: 0 }),
      period({ id: '3', insuranceCompanyId: 'insurer-2', settlementStatus: 'reconciled', totalClaimsSubmitted: 500, paymentReceived: 430, rejectionAmount: 40, actualWithholdingTax: 30, withholdingTaxVariance: -20 }),
    ];
    const summary = summarizeSettlementPeriods(rows, new Date('2026-09-01T00:00:00Z'));
    expect(summary.periodCount).toBe(3);
    expect(summary.awaitingPaymentCount).toBe(1);
    expect(summary.adviceReceivedCount).toBe(1);
    expect(summary.reconciledCount).toBe(1);
    expect(summary.totalSubmitted).toBe(2500);
    expect(summary.totalPaymentReceived).toBe(1230);
    expect(summary.totalRejectionAmount).toBe(190);
    expect(summary.totalActualWht).toBe(80);
    expect(summary.totalWhtVariance).toBe(-20);
    expect(summary.totalResidual).toBe(0);
    expect(summary.totalOutstanding).toBe(0);
    expect(summary.totalOverSettled).toBe(0);
    expect(summary.balancedCount).toBe(2);
    expect(summary.underSettledCount).toBe(0);
    expect(summary.overSettledCount).toBe(0);
    expect(summary.overdueCount).toBe(1);
  });

  it('reports signed under- and over-settlement without hiding negative residuals', () => {
    const rows = [
      period({ id: 'under', settlementStatus: 'reconciled', paymentReceived: 750, rejectionAmount: 100, actualWithholdingTax: 50 }),
      period({ id: 'over', settlementStatus: 'reconciled', paymentReceived: 850, rejectionAmount: 100, actualWithholdingTax: 50 }),
    ];
    const summary = summarizeSettlementPeriods(rows);
    expect(summary.totalResidual).toBe(0);
    expect(summary.totalOutstanding).toBe(50);
    expect(summary.totalOverSettled).toBe(50);
    expect(summary.balancedCount).toBe(0);
    expect(summary.underSettledCount).toBe(1);
    expect(summary.overSettledCount).toBe(1);
  });

  it('groups signed reconciliation totals by insurer', () => {
    const rows = [
      period({ id: '1', paymentReceived: 800, rejectionAmount: 100, actualWithholdingTax: 50 }),
      period({ id: '2', paymentReceived: 850, rejectionAmount: 100, actualWithholdingTax: 50 }),
      period({ id: '3', insuranceCompanyId: 'insurer-2', totalClaimsSubmitted: 200, paymentReceived: 180, rejectionAmount: 10, actualWithholdingTax: 10 }),
    ];
    const result = summarizeSettlementsByInsurer(rows);
    expect(result[0]).toMatchObject({
      insurerId: 'insurer-1',
      periodCount: 2,
      totalSubmitted: 2000,
      totalPaymentReceived: 1650,
      totalRejectionAmount: 200,
      totalWhtVariance: 0,
      totalResidual: 50,
      totalOutstanding: 50,
      totalOverSettled: 0,
      balancedCount: 0,
      underSettledCount: 1,
      overSettledCount: 1,
    });
    expect(result[1]).toMatchObject({ insurerId: 'insurer-2', periodCount: 1, totalSubmitted: 200, totalResidual: 0, balancedCount: 1 });
  });
});
