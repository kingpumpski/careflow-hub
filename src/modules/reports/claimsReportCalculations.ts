export interface ClaimReportInput {
  claim_amount?: number | string | null;
  status?: string | null;
}

export function calculateClaimGrossTotals(claims: readonly ClaimReportInput[]) {
  const submittedGross = claims.reduce((sum, claim) => sum + Number(claim.claim_amount || 0), 0);
  const rejectedGross = claims
    .filter((claim) => String(claim.status || "").toLowerCase() === "rejected")
    .reduce((sum, claim) => sum + Number(claim.claim_amount || 0), 0);

  return {
    submittedGross,
    rejectedGross,
    netClaim: submittedGross - rejectedGross,
  };
}

export interface WithholdingRateBasisInput {
  actualBasisAmount: number | null;
  provisionalBasisAmount: number;
  provisionalTax: number;
  actualTax: number;
  hasActualAdvice: boolean;
  hasProvisionalApplied: boolean;
  hasTaxData: boolean;
}

export function calculateWithholdingRateBasis(input: WithholdingRateBasisInput) {
  if (!input.hasTaxData) {
    return { taxBasisLabel: "—", taxBasisAmount: null, taxRate: null };
  }

  if (input.hasActualAdvice && input.hasProvisionalApplied) {
    return { taxBasisLabel: "Mixed", taxBasisAmount: null, taxRate: null };
  }

  if (input.hasActualAdvice) {
    const taxBasisAmount = input.actualBasisAmount;
    return {
      taxBasisLabel: "Approved gross",
      taxBasisAmount,
      taxRate: taxBasisAmount != null && taxBasisAmount > 0
        ? input.actualTax / taxBasisAmount
        : null,
    };
  }

  const taxBasisAmount = input.provisionalBasisAmount;
  return {
    taxBasisLabel: "Submitted gross",
    taxBasisAmount,
    taxRate: taxBasisAmount > 0 ? input.provisionalTax / taxBasisAmount : null,
  };
}

export interface WithholdingPeriodAmounts {
  actual: number;
  provisional: number;
  actualCount: number;
}

/**
 * Apply actual WHT in a claims month when insurer advice exists; otherwise
 * apply the provisional estimate. Never add both for the same month.
 */
export function calculateAppliedWithholdingTax(periods: readonly WithholdingPeriodAmounts[]): number {
  return periods.reduce(
    (sum, period) => sum + (period.actualCount > 0 ? period.actual : period.provisional),
    0,
  );
}
