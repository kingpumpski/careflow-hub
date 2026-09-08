import { describe, expect, it } from 'vitest';
import { canTransitionSettlementException, detectSettlementExceptions } from './settlement-exception-register';

describe('settlement exception register', () => {
  const base = { id: 'p1', facilityId: 'f1', insuranceCompanyId: 'i1', periodStart: '2026-07-01', periodEnd: '2026-07-31', periodType: 'month' as const, totalClaimsSubmitted: 100000, withholdingTaxRate: 5, provisionalWithholdingTax: 5000, paymentReceived: null, rejectionAmount: null, actualWithholdingTax: null, paymentAdviceReference: null, paymentAdviceDate: null, settlementStatus: 'awaiting_payment' as const, withholdingTaxVariance: null, confirmedBy: null, confirmedAt: null };

  it('detects overdue and missing advice without inventing financial values', () => {
    const exceptions = detectSettlementExceptions(base, new Date('2026-09-10T00:00:00Z'));
    expect(exceptions.map((item) => item.type)).toEqual(['missing_payment_advice']);
    expect(exceptions[0].reason).toContain('payment advice');
  });

  it('detects critical overdue settlement after 30 days', () => {
    const exceptions = detectSettlementExceptions(base, new Date('2026-09-01T00:00:00Z'));
    expect(exceptions.map((item) => item.type)).toEqual(['overdue_settlement', 'missing_payment_advice']);
    expect(exceptions[0].severity).toBe('critical');
  });

  it('detects confirmed WHT variance only after actual WHT exists', () => {
    expect(detectSettlementExceptions({ ...base, settlementStatus: 'payment_advice_received', paymentReceived: 82000, rejectionAmount: 12000, actualWithholdingTax: 6000, paymentAdviceReference: 'PA-1', paymentAdviceDate: '2026-08-15', withholdingTaxVariance: 1000 }, new Date('2026-09-10'))).toHaveLength(1);
    expect(detectSettlementExceptions(base, new Date('2026-09-10'))[0].type).toBe('missing_payment_advice');
  });

  it('allows only the controlled exception lifecycle', () => {
    expect(canTransitionSettlementException('open', 'under_review')).toBe(true);
    expect(canTransitionSettlementException('under_review', 'resolved')).toBe(true);
    expect(canTransitionSettlementException('under_review', 'waived')).toBe(true);
    expect(canTransitionSettlementException('open', 'resolved')).toBe(false);
    expect(canTransitionSettlementException('resolved', 'open')).toBe(false);
  });
});
