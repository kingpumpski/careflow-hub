import { describe, expect, it } from 'vitest';
import {
  calculateProvisionalWithholdingTax,
  calculateSettlementReconciliation,
  calculateWithholdingTaxVariance,
  canReconcileSettlement,
  isSettlementConfirmed,
} from './settlement';

describe('claims settlement domain', () => {
  it('calculates provisional WHT without treating it as actual', () => {
    expect(calculateProvisionalWithholdingTax(100_000, 5)).toBe(5_000);
  });

  it('calculates the variance only after actual WHT is confirmed', () => {
    expect(calculateWithholdingTaxVariance(5_000, null)).toBeNull();
    expect(calculateWithholdingTaxVariance(5_000, 6_000)).toBe(1_000);
  });

  it('does not derive actual WHT from payment or rejection amounts', () => {
    const provisional = calculateProvisionalWithholdingTax(100_000, 5);
    expect(provisional).toBe(5_000);
    expect(calculateWithholdingTaxVariance(provisional, null)).toBeNull();
  });

  it('rejects invalid financial inputs', () => {
    expect(() => calculateProvisionalWithholdingTax(-1, 5)).toThrow();
    expect(() => calculateProvisionalWithholdingTax(100_000, 101)).toThrow();
    expect(() => calculateWithholdingTaxVariance(5_000, -1)).toThrow();
    expect(() => calculateSettlementReconciliation(100_000, -1, 90_000, 5_000)).toThrow();
  });

  it('marks payment-advice states as confirmed while awaiting payment remains provisional', () => {
    expect(isSettlementConfirmed('awaiting_payment')).toBe(false);
    expect(isSettlementConfirmed('payment_advice_received')).toBe(true);
    expect(isSettlementConfirmed('reconciled')).toBe(true);
  });

  it('allows reconciliation only after all payment-advice fields are present', () => {
    const period = {
      settlementStatus: 'payment_advice_received' as const,
      paymentReceived: 82_000,
      rejectionAmount: 12_000,
      actualWithholdingTax: 6_000,
      paymentAdviceReference: 'PA-2026-001',
      paymentAdviceDate: '2026-09-08',
    };

    expect(canReconcileSettlement(period)).toBe(true);
    expect(canReconcileSettlement({ ...period, actualWithholdingTax: null })).toBe(false);
    expect(canReconcileSettlement({ ...period, settlementStatus: 'awaiting_payment' })).toBe(false);
    expect(canReconcileSettlement({ ...period, paymentAdviceReference: ' ' })).toBe(false);
  });

  it('uses the canonical submitted minus rejection minus payment minus actual WHT formula', () => {
    const result = calculateSettlementReconciliation(100_000, 12_000, 82_000, 6_000);

    expect(result.residual).toBe(0);
    expect(result.outstanding).toBe(0);
    expect(result.balanced).toBe(true);
  });

  it('preserves a signed residual while clamping outstanding at zero', () => {
    const underSettled = calculateSettlementReconciliation(100_000, 10_000, 80_000, 5_000);
    expect(underSettled.residual).toBe(5_000);
    expect(underSettled.outstanding).toBe(5_000);
    expect(underSettled.balanced).toBe(false);

    const overSettled = calculateSettlementReconciliation(100_000, 10_000, 90_000, 5_000);
    expect(overSettled.residual).toBe(-5_000);
    expect(overSettled.outstanding).toBe(0);
    expect(overSettled.balanced).toBe(false);
  });
});
