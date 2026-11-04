import { describe, expect, it } from "vitest";
import { calculateSettlementRates } from "./settlementRates";

describe("calculateSettlementRates", () => {
  it("calculates financial performance percentages from settlement rows", () => {
    const result = calculateSettlementRates([
      { submitted_amount: 1000, rejected_amount: 100, paid_amount: 600, withholding_tax_amount: 50, outstanding_amount: 250 },
      { submitted_amount: 500, rejected_amount: 50, paid_amount: 300, withholding_tax_amount: 25, outstanding_amount: 125 },
    ]);

    expect(result).toMatchObject({
      rejectedPercent: 10,
      collectionPercent: 66.66666666666666,
      withholdingTaxPercent: 5.555555555555555,
      outstandingPercent: 27.77777777777778,
      submitted: 1500,
      rejected: 150,
      eligible: 1350,
      paid: 900,
      withholdingTax: 75,
      outstanding: 375,
      periods: 2,
    });
  });

  it("returns null rates when the denominator is zero", () => {
    expect(calculateSettlementRates([])).toMatchObject({
      rejectedPercent: null,
      collectionPercent: null,
      withholdingTaxPercent: null,
      outstandingPercent: null,
      periods: 0,
    });
  });

  it("does not produce a negative eligible balance", () => {
    const result = calculateSettlementRates([
      { submitted_amount: 100, rejected_amount: 150, paid_amount: 0, withholding_tax_amount: 0, outstanding_amount: 0 },
    ]);
    expect(result.eligible).toBe(0);
    expect(result.collectionPercent).toBeNull();
  });
});
