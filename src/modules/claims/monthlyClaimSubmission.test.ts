import { describe, expect, it } from "vitest";
import { buildMonthlyClaimSubmissionArgs } from "./monthlyClaimSubmission";

const validForm = {
  insurance_company_id: "123e4567-e89b-42d3-a456-426614174000",
  claim_amount: "1250.40",
  claim_month: "11",
  claim_year: "2026",
};

describe("buildMonthlyClaimSubmissionArgs", () => {
  it("preserves the exact decimal amount and normalizes the period", () => {
    expect(buildMonthlyClaimSubmissionArgs(validForm)).toEqual({
      p_insurance_company_id: validForm.insurance_company_id,
      p_claim_amount: "1250.40",
      p_claim_month: 11,
      p_claim_year: 2026,
    });
  });

  it("rejects a missing or malformed insurer", () => {
    expect(() => buildMonthlyClaimSubmissionArgs({ ...validForm, insurance_company_id: "" })).toThrow("insurance company");
    expect(() => buildMonthlyClaimSubmissionArgs({ ...validForm, insurance_company_id: "not-a-uuid" })).toThrow("insurance company");
  });

  it.each(["", "0", "0.00", "-1.00", "1.234", "1e3", "1,000.00", "Infinity"])(
    "rejects invalid claim amount %s",
    (claim_amount) => {
      expect(() => buildMonthlyClaimSubmissionArgs({ ...validForm, claim_amount })).toThrow("claim amount");
    },
  );

  it.each(["0", "13", "1.5", "January"])("rejects invalid claim month %s", (claim_month) => {
    expect(() => buildMonthlyClaimSubmissionArgs({ ...validForm, claim_month })).toThrow("claim month");
  });

  it.each(["0", "10000", "2026.5", "2e3", ""])("rejects invalid claim year %s", (claim_year) => {
    expect(() => buildMonthlyClaimSubmissionArgs({ ...validForm, claim_year })).toThrow("claim year");
  });
});
