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
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate the monthly claim form without converting the monetary amount to a
 * JavaScript float. The database receives the exact decimal string and owns
 * the authoritative WHT calculation.
 */
export function buildMonthlyClaimSubmissionArgs(
  values: MonthlyClaimFormValues,
): MonthlyClaimSubmissionArgs {
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
  };
}
