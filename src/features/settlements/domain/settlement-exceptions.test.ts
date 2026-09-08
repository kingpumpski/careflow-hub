import { describe, expect, it } from 'vitest';
import { canChangeSettlementExceptionStatus, detectSettlementExceptions, SETTLEMENT_OVERDUE_DAYS } from './settlement-exceptions';

const base = {
  id: 'period-1',
  facilityId: 'facility-1',
  periodEnd: '2026-08-01',
  settlementStatus: 'awaiting_payment' as const,
  paymentReceived: null,
  rejectionAmount: null,
  actualWithholdingTax: null,
  withholdingTaxVariance: null,
  paymentAdviceReference: null,
  paymentAdviceDate: null,
};

describe('settlement exception detection', () => {
  it('flags pending and overdue settlements after the monitoring window', () => {
    const exceptions = detectSettlementExceptions(base, new Date('2026-09-02T12:00:00Z'));
    expect(exceptions.map((item) => item.type)).toEqual(['overdue_settlement', 'missing_payment_advice']);
  });

  it('does not call provisional WHT an actual variance before advice', () => {
    const exceptions = detectSettlementExceptions(base, new Date('2026-08-20T12:00:00Z'));
    expect(exceptions.some((item) => item.type === 'withholding_tax_variance')).toBe(false);
  });

  it('flags a material confirmed WHT variance', () => {
    const exceptions = detectSettlementExceptions({
      ...base,
      settlementStatus: 'payment_advice_received',
      paymentReceived: 82000,
      rejectionAmount: 12000,
      actualWithholdingTax: 6000,
      withholdingTaxVariance: 1000,
      paymentAdviceReference: 'PA-1',
      paymentAdviceDate: '2026-09-01',
    }, new Date('2026-09-02T12:00:00Z'));
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].type).toBe('withholding_tax_variance');
    expect(exceptions[0].severity).toBe('critical');
  });

  it('flags incomplete advice on a confirmed status', () => {
    const exceptions = detectSettlementExceptions({ ...base, settlementStatus: 'payment_advice_received' }, new Date('2026-09-02T12:00:00Z'));
    expect(exceptions.map((item) => item.type)).toEqual(['incomplete_payment_advice']);
    expect(exceptions[0].severity).toBe('critical');
  });

  it('keeps the overdue window explicit and lifecycle transitions controlled', () => {
    expect(SETTLEMENT_OVERDUE_DAYS).toBe(30);
    expect(canChangeSettlementExceptionStatus('open', 'under_review')).toBe(true);
    expect(canChangeSettlementExceptionStatus('under_review', 'resolved')).toBe(true);
    expect(canChangeSettlementExceptionStatus('under_review', 'waived')).toBe(true);
    expect(canChangeSettlementExceptionStatus('resolved', 'open')).toBe(false);
    expect(canChangeSettlementExceptionStatus('waived', 'resolved')).toBe(false);
  });
});
