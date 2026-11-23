import { describe, expect, it } from 'vitest';
import {
  calculateActualWithholdingTax,
  isFullCalendarMonth,
  calculateApprovedClaimAmount,
  calculateProvisionalWithholdingTax,
  calculateSettlementReconciliation,
  calculateWithholdingTaxVariance,
  canReconcileSettlement,
  isSettlementConfirmed,
  parseApprovedWithholdingTaxRate,
} from './settlement';

describe('claims settlement domain', () => {
  it('accepts only complete calendar-month ranges for monthly reporting', () => {
    expect(isFullCalendarMonth('2026-02-01', '2026-02-28')).toBe(true);
    expect(isFullCalendarMonth('2024-02-01', '2024-02-29')).toBe(true);
    expect(isFullCalendarMonth('2026-02-02', '2026-02-28')).toBe(false);
    expect(isFullCalendarMonth('2026-02-01', '2026-02-27')).toBe(false);
    expect(isFullCalendarMonth('2026-02-01', '2026-03-01')).toBe(false);
  });

  it('requires an explicitly entered approved WHT rate and accepts explicit zero', () => {
    expect(() => parseApprovedWithholdingTaxRate('')).toThrow('required');
    expect(parseApprovedWithholdingTaxRate('0')).toBe(0);
    expect(parseApprovedWithholdingTaxRate('5')).toBe(5);
    expect(() => parseApprovedWithholdingTaxRate('101')).toThrow('between 0 and 100');
    expect(() => parseApprovedWithholdingTaxRate('not-a-rate')).toThrow('between 0 and 100');
  });

  it('keeps provisional WHT on the full submitted amount after rejection', () => {
    const submitted = 1_000;
    const explicitFacilityRate = 7.5;
    const provisional = calculateProvisionalWithholdingTax(submitted, explicitFacilityRate);
    const approved = calculateApprovedClaimAmount(submitted, 100);

    expect(provisional).toBe(75);
    expect(approved).toBe(900);
    // Rejection is a separate settlement component; the estimate stays at GHC 75.
    expect(calculateProvisionalWithholdingTax(submitted, explicitFacilityRate)).toBe(75);
  });

  it('calculates actual WHT on the approved gross amount after payment advice', () => {
    expect(calculateActualWithholdingTax(1_000, 100, 7.5)).toBe(67.5);
    expect(calculateActualWithholdingTax(1_000, 0, 7.5)).toBe(75);
  });

  it('rejects a rejection amount greater than the submitted claim', () => {
    expect(() => calculateApprovedClaimAmount(1_000, 1_001)).toThrow('cannot exceed');
    expect(() => calculateActualWithholdingTax(1_000, -1, 7.5)).toThrow();
  });

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
    expect(result.overSettled).toBe(0);
    expect(result.direction).toBe('balanced');
    expect(result.balanced).toBe(true);
  });

  it('reconciles the GHC 1,000 / GHC 100 rejection example using net cash and actual WHT', () => {
    // Test-only rate: 7.5%. Approved gross = 900; actual WHT = 67.50;
    // the corresponding net cash received is 832.50.
    const result = calculateSettlementReconciliation(1_000, 100, 832.5, 67.5);
    expect(result.residual).toBe(0);
    expect(result.direction).toBe('balanced');
    expect(result.balanced).toBe(true);
  });

  it('preserves positive residual as an under-settlement', () => {
    const result = calculateSettlementReconciliation(100_000, 10_000, 80_000, 5_000);
    expect(result.residual).toBe(5_000);
    expect(result.outstanding).toBe(5_000);
    expect(result.overSettled).toBe(0);
    expect(result.direction).toBe('under_settlement');
    expect(result.balanced).toBe(false);
  });

  it('preserves negative residual as an over-settlement instead of hiding it', () => {
    const result = calculateSettlementReconciliation(100_000, 10_000, 90_000, 5_000);
    expect(result.residual).toBe(-5_000);
    expect(result.outstanding).toBe(0);
    expect(result.overSettled).toBe(5_000);
    expect(result.direction).toBe('over_settlement');
    expect(result.balanced).toBe(false);
  });

  it('matches a later-month remittance to its originating claims cycle', async () => {
    const { reconcileClaimsCycle } = await import('./settlement');
    const result = reconcileClaimsCycle({
      claimsPeriod: '2026-09',
      submittedAmount: 1_000,
      provisionalWithholdingTax: 50,
      remittances: [{
        adviceReference: 'ADV-SEP-01',
        adviceDate: '2026-10-02',
        receiptDate: '2026-10-05',
        approvedAmount: 900,
        rejectedAmount: 100,
        actualWithholdingTax: 45,
        netCashReceived: 855,
      }],
    });

    expect(result.submittedAmount).toBe(1_000);
    expect(result.provisionalWithholdingTax).toBe(50);
    expect(result.approvedAmount).toBe(900);
    expect(result.rejectedAmount).toBe(100);
    expect(result.actualWithholdingTax).toBe(45);
    expect(result.netCashReceived).toBe(855);
    expect(result.overallVariance).toBe(0);
    expect(result.receiptMonthTotals).toEqual([{
      receiptMonth: '2026-10',
      netCashReceived: 855,
      actualWithholdingTax: 45,
      remittanceCount: 1,
    }]);
    expect(result.balanced).toBe(true);
  });

  it('supports partial remittances across receipt months without losing the claims month', async () => {
    const { reconcileClaimsCycle } = await import('./settlement');
    const result = reconcileClaimsCycle({
      claimsPeriod: '2026-09',
      submittedAmount: 1_000,
      provisionalWithholdingTax: 50,
      remittances: [
        { adviceReference: 'ADV-1', adviceDate: '2026-10-02', receiptDate: '2026-10-05', approvedAmount: 500, rejectedAmount: 100, actualWithholdingTax: 25, netCashReceived: 475 },
        { adviceReference: 'ADV-2', adviceDate: '2026-11-03', receiptDate: '2026-11-06', approvedAmount: 400, rejectedAmount: 0, actualWithholdingTax: 20, netCashReceived: 380 },
      ],
    });

    expect(result.claimsPeriod).toBe('2026-09');
    expect(result.approvedAmount).toBe(900);
    expect(result.rejectedAmount).toBe(100);
    expect(result.approvedUnpaidBalance).toBe(0);
    expect(result.receiptMonthTotals.map((item) => item.receiptMonth)).toEqual(['2026-10', '2026-11']);
    expect(result.receiptMonthTotals.map((item) => item.netCashReceived)).toEqual([475, 380]);
    expect(result.balanced).toBe(true);
  });

  it('flags an insurer advice mismatch instead of forcing the figures to balance', async () => {
    const { reconcileClaimsCycle } = await import('./settlement');
    const result = reconcileClaimsCycle({
      claimsPeriod: '2026-09',
      submittedAmount: 1_000,
      provisionalWithholdingTax: 50,
      remittances: [{
        adviceReference: 'ADV-DIFF',
        adviceDate: '2026-10-02',
        receiptDate: '2026-10-05',
        approvedAmount: 880,
        rejectedAmount: 100,
        actualWithholdingTax: 44,
        netCashReceived: 836,
      }],
    });

    expect(result.approvalVariance).toBe(20);
    expect(result.overallVariance).toBe(20);
    expect(result.balanced).toBe(false);
  });

  it('rejects duplicate advice references even when letter casing differs', async () => {
    const { reconcileClaimsCycle } = await import('./settlement');
    const base = {
      adviceDate: '2026-10-02',
      receiptDate: '2026-10-05',
      approvedAmount: 500,
      rejectedAmount: 0,
      actualWithholdingTax: 25,
      netCashReceived: 475,
    };
    expect(() => reconcileClaimsCycle({
      claimsPeriod: '2026-09',
      submittedAmount: 1_000,
      provisionalWithholdingTax: 50,
      remittances: [
        { ...base, adviceReference: 'ADV-1' },
        { ...base, adviceReference: ' adv-1 ' },
      ],
    })).toThrow('unique');
  });

  it('rejects impossible calendar dates in advice and receipt data', async () => {
    const { reconcileClaimsCycle } = await import('./settlement');
    const base = {
      adviceReference: 'ADV-DATE',
      adviceDate: '2026-10-02',
      receiptDate: '2026-10-05',
      approvedAmount: 500,
      rejectedAmount: 0,
      actualWithholdingTax: 25,
      netCashReceived: 475,
    };
    expect(() => reconcileClaimsCycle({
      claimsPeriod: '2026-09',
      submittedAmount: 1_000,
      provisionalWithholdingTax: 50,
      remittances: [{ ...base, adviceDate: '2026-02-30' }],
    })).toThrow('valid calendar dates');
    expect(() => reconcileClaimsCycle({
      claimsPeriod: '2026-09',
      submittedAmount: 1_000,
      provisionalWithholdingTax: 50,
      remittances: [{ ...base, receiptDate: '2026-13-01' }],
    })).toThrow('valid calendar dates');
  });

  it('rejects duplicate advice references to prevent double counting', async () => {
    const { reconcileClaimsCycle } = await import('./settlement');
    const remittance = {
      adviceReference: 'DUP-1',
      adviceDate: '2026-10-02',
      receiptDate: '2026-10-05',
      approvedAmount: 500,
      rejectedAmount: 0,
      actualWithholdingTax: 25,
      netCashReceived: 475,
    };
    expect(() => reconcileClaimsCycle({
      claimsPeriod: '2026-09',
      submittedAmount: 1_000,
      provisionalWithholdingTax: 50,
      remittances: [remittance, remittance],
    })).toThrow('unique');
  });

});