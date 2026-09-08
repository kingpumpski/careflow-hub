import { describe, expect, it } from 'vitest';
import { detectSettlementExceptions } from './settlement-exceptions';

const base = {
  id: 'period-1',
  periodEnd: '2026-09-01',
  settlementStatus: 'awaiting_payment' as const,
  paymentReceived: null,
  rejectionAmount: null,
  actualWithholdingTax: null,
  provisionalWithholdingTax: 5000,
  withholdingTaxVariance: null,
  paymentAdviceReference: null,
  paymentAdviceDate: null,
};

describe('settlement exception detection', () => {
  it('flags pending and overdue settlements', () => {
    const exceptions = detectSettlementExceptions(base, new Date('2026-09-10T12:00:00Z'));
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
      paymentAdviceDate: '2026-09-08',
    }, new Date('2026-09-08T12:00:00Z'));
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].type).toBe('withholding_tax_variance');
    expect(exceptions[0].severity).toBe('critical');
  });

  it('flags incomplete advice on a confirmed status', () => {
    const exceptions = detectSettlementExceptions({ ...base, settlementStatus: 'payment_advice_received' }, new Date('2026-09-08T12:00:00Z'));
    expect(exceptions.map((item) => item.type)).toEqual(['missing_payment_advice']);
    expect(exceptions[0].severity).toBe('critical');
  });
});
