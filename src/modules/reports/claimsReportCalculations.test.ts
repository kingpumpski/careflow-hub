import { describe, expect, it } from "vitest";
import { calculateAppliedWithholdingTax, calculateClaimGrossTotals, calculateWithholdingRateBasis } from "./claimsReportCalculations";

describe("claim report gross totals", () => {
  it("keeps rejected claims inside submitted gross and subtracts them once for net claims", () => {
    expect(calculateClaimGrossTotals([
      { claim_amount: 900, status: "submitted" },
      { claim_amount: 100, status: "rejected" },
    ])).toEqual({ submittedGross: 1000, rejectedGross: 100, netClaim: 900 });
  });

  it("does not subtract rejected claims when there are none", () => {
    expect(calculateClaimGrossTotals([
      { claim_amount: "750.25", status: "submitted" },
    ])).toEqual({ submittedGross: 750.25, rejectedGross: 0, netClaim: 750.25 });
  });
});

describe("withholding rate basis", () => {
  it("calculates actual WHT rate on insurer-approved gross", () => {
    expect(calculateWithholdingRateBasis({
      actualBasisAmount: 900,
      provisionalBasisAmount: 1000,
      provisionalTax: 50,
      actualTax: 22.5,
      hasActualAdvice: true,
      hasProvisionalApplied: false,
      hasTaxData: true,
    })).toEqual({ taxBasisLabel: "Approved gross", taxBasisAmount: 900, taxRate: 0.025 });
  });

  it("calculates provisional WHT rate on the submitted gross for periods with provisional advice", () => {
    expect(calculateWithholdingRateBasis({
      actualBasisAmount: null,
      provisionalBasisAmount: 1000,
      provisionalTax: 50,
      actualTax: 0,
      hasActualAdvice: false,
      hasProvisionalApplied: true,
      hasTaxData: true,
    })).toEqual({ taxBasisLabel: "Submitted gross", taxBasisAmount: 1000, taxRate: 0.05 });
  });

  it("does not invent one rate when periods mix actual and provisional WHT", () => {
    expect(calculateWithholdingRateBasis({
      actualBasisAmount: 900,
      provisionalBasisAmount: 1000,
      provisionalTax: 50,
      actualTax: 22.5,
      hasActualAdvice: true,
      hasProvisionalApplied: true,
      hasTaxData: true,
    })).toEqual({ taxBasisLabel: "Mixed", taxBasisAmount: null, taxRate: null });
  });

  it("does not infer an actual rate without approved gross", () => {
    expect(calculateWithholdingRateBasis({
      actualBasisAmount: null,
      provisionalBasisAmount: 1000,
      provisionalTax: 50,
      actualTax: 22.5,
      hasActualAdvice: true,
      hasProvisionalApplied: false,
      hasTaxData: true,
    })).toEqual({ taxBasisLabel: "Approved gross", taxBasisAmount: null, taxRate: null });
  });

  it("does not show a rate when no withholding data exists", () => {
    expect(calculateWithholdingRateBasis({
      actualBasisAmount: null,
      provisionalBasisAmount: 0,
      provisionalTax: 0,
      actualTax: 0,
      hasActualAdvice: false,
      hasProvisionalApplied: false,
      hasTaxData: false,
    })).toEqual({ taxBasisLabel: "—", taxBasisAmount: null, taxRate: null });
  });
});

describe("applied withholding tax by claims month", () => {
  it("uses actual WHT instead of adding provisional WHT in the same month", () => {
    expect(calculateAppliedWithholdingTax([
      { actual: 22.5, provisional: 50, actualCount: 1 },
      { actual: 0, provisional: 10, actualCount: 0 },
    ])).toBe(32.5);
  });
});
