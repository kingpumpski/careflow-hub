import { describe, expect, it } from 'vitest';
import {
  calculateProvisionalWithholdingTax,
  calculateWithholdingTaxVariance,
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
  });

  it('marks payment-advice states as confirmed while awaiting payment remains provisional', () => {
    expect(isSettlementConfirmed('awaiting_payment')).toBe(false);
    expect(isSettlementConfirmed('payment_advice_received')).toBe(true);
    expect(isSettlementConfirmed('reconciled')).toBe(true);
  });
});
