import { describe, expect, it } from "vitest";
import { buildClaimRejectionSubmissionArgs, buildMonthlyClaimSubmissionArgs } from "./monthlyClaimSubmission";

const facilityId = "123e4567-e89b-42d3-a456-426614174001";

const validForm = {
  insurance_company_id: "123e4567-e89b-42d3-a456-426614174000",
  claim_amount: "1250.40",
  claim_month: "11",
  claim_year: "2026",
};

describe("buildMonthlyClaimSubmissionArgs", () => {
  it("preserves the exact decimal amount and normalizes the period", () => {
    expect(buildMonthlyClaimSubmissionArgs(validForm, facilityId)).toEqual({
      p_insurance_company_id: validForm.insurance_company_id,
      p_claim_amount: "1250.40",
      p_claim_month: 11,
      p_claim_year: 2026,
      p_facility_id: facilityId,
    });
  });

  it("rejects a missing or malformed insurer", () => {
    expect(() => buildMonthlyClaimSubmissionArgs({ ...validForm, insurance_company_id: "" }, facilityId)).toThrow(/insurance company/i);
    expect(() => buildMonthlyClaimSubmissionArgs({ ...validForm, insurance_company_id: "not-a-uuid" }, facilityId)).toThrow("insurance company");
  });

  it.each(["", "0", "0.00", "-1.00", "1.234", "1e3", "1,000.00", "Infinity"])(
    "rejects invalid claim amount %s",
    (claim_amount) => {
      expect(() => buildMonthlyClaimSubmissionArgs({ ...validForm, claim_amount }, facilityId)).toThrow(/claim amount/i);
    },
  );

  it.each(["0", "13", "1.5", "January"])("rejects invalid claim month %s", (claim_month) => {
    expect(() => buildMonthlyClaimSubmissionArgs({ ...validForm, claim_month }, facilityId)).toThrow(/claim month/i);
  });

  it.each(["0", "10000", "2026.5", "2e3", ""])("rejects invalid claim year %s", (claim_year) => {
    expect(() => buildMonthlyClaimSubmissionArgs({ ...validForm, claim_year }, facilityId)).toThrow(/claim year/i);
  });
});

describe("buildClaimRejectionSubmissionArgs", () => {
  it("preserves the rejected amount and optional denial details", () => {
    expect(buildClaimRejectionSubmissionArgs({
      insurance_company_id: validForm.insurance_company_id,
      rejected_amount: "250.75",
      claim_month: "2",
      claim_year: "2026",
      denial_category: "coding_error",
      denial_reason: "Missing supporting code",
      root_cause: "coding",
      denial_notes: "",
    }, facilityId)).toEqual({
      p_insurance_company_id: validForm.insurance_company_id,
      p_rejected_amount: "250.75",
      p_claim_month: 2,
      p_claim_year: 2026,
      p_denial_category: "coding_error",
      p_denial_reason: "Missing supporting code",
      p_root_cause: "coding",
      p_denial_notes: null,
      p_facility_id: facilityId,
    });
  });

  it("uses the same strict amount and period validation as monthly submissions", () => {
    expect(() => buildClaimRejectionSubmissionArgs({
      insurance_company_id: validForm.insurance_company_id,
      rejected_amount: "250.999",
      claim_month: "2",
      claim_year: "2026",
      denial_category: "",
      denial_reason: "",
      root_cause: "",
      denial_notes: "",
    }, facilityId)).toThrow("claim amount");
  });
});
