export type MonthlyClaimFormValues = {
  insurance_company_id: string;
  claim_amount: string;
  claim_month: string;
  claim_year: string;
};

export type MonthlyClaimSubmissionArgs = {
  p_insurance_company_id: string;
  p_claim_amount: string;
  p_claim_month: number;
  p_claim_year: number;
  p_facility_id: string;
  p_idempotency_key: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate the monthly claim form without converting the monetary amount to a
 * JavaScript float. The database receives the exact decimal string and owns
 * the authoritative WHT calculation.
 */
export function buildMonthlyClaimSubmissionArgs(
  values: MonthlyClaimFormValues,
  facilityId: string | null | undefined,
  idempotencyKey = crypto.randomUUID(),
): MonthlyClaimSubmissionArgs {
  if (!facilityId || !UUID_PATTERN.test(facilityId)) {
    throw new Error("Select an active facility before submitting claims.");
  }

  if (idempotencyKey.trim().length < 8 || idempotencyKey.length > 200) {
    throw new Error("A valid monthly-claim idempotency key is required.");
  }

  const insurerId = values.insurance_company_id.trim();
  if (!UUID_PATTERN.test(insurerId)) {
    throw new Error("Select a valid insurance company.");
  }

  const amount = values.claim_amount.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    throw new Error("Enter a claim amount greater than zero with no more than two decimal places.");
  }

  const monthText = values.claim_month.trim();
  if (!/^\d{1,2}$/.test(monthText)) {
    throw new Error("Select a valid claim month.");
  }
  const month = Number(monthText);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Claim month must be between 1 and 12.");
  }

  const yearText = values.claim_year.trim();
  if (!/^\d{1,4}$/.test(yearText)) {
    throw new Error("Enter a valid claim year.");
  }
  const year = Number(yearText);
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new Error("Claim year must be between 1 and 9999.");
  }

  return {
    p_insurance_company_id: insurerId,
    p_claim_amount: amount,
    p_claim_month: month,
    p_claim_year: year,
    p_facility_id: facilityId,
    p_idempotency_key: idempotencyKey.trim(),
  };
}

export type ClaimRejectionFormValues = {
  insurance_company_id: string;
  rejected_amount: string;
  claim_month: string;
  claim_year: string;
  denial_category: string;
  denial_reason: string;
  root_cause: string;
  denial_notes: string;
};

export type ClaimRejectionSubmissionArgs = {
  p_insurance_company_id: string;
  p_rejected_amount: string;
  p_claim_month: number;
  p_claim_year: number;
  p_denial_category: string | null;
  p_denial_reason: string | null;
  p_root_cause: string | null;
  p_denial_notes: string | null;
  p_facility_id: string;
};

export function buildClaimRejectionSubmissionArgs(
  values: ClaimRejectionFormValues,
  facilityId: string | null | undefined,
): ClaimRejectionSubmissionArgs {
  const base = buildMonthlyClaimSubmissionArgs({
    insurance_company_id: values.insurance_company_id,
    claim_amount: values.rejected_amount,
    claim_month: values.claim_month,
    claim_year: values.claim_year,
  }, facilityId);

  return {
    p_insurance_company_id: base.p_insurance_company_id,
    p_rejected_amount: base.p_claim_amount,
    p_claim_month: base.p_claim_month,
    p_claim_year: base.p_claim_year,
    p_denial_category: values.denial_category.trim() || null,
    p_denial_reason: values.denial_reason.trim() || null,
    p_root_cause: values.root_cause.trim() || null,
    p_denial_notes: values.denial_notes.trim() || null,
    p_facility_id: base.p_facility_id,
  };
}
