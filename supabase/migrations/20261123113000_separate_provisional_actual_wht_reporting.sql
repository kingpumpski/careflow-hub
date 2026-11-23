-- Keep provisional estimates and confirmed actual WHT in separate reporting columns.
-- Rejection records are separate events, not additional submitted claim value.
-- The legacy withholding_tax_amount remains as the amount used by the outstanding
-- calculation: provisional while awaiting payment advice, actual once actual WHT
-- entries exist. Provisional estimates are never added to confirmed actual WHT.

CREATE OR REPLACE VIEW public.claims_outstanding_periods
WITH (security_invoker = true)
AS
WITH claim_periods AS (
  SELECT
    c.insurance_company_id,
    c.claim_year AS period_year,
    c.claim_month AS period_month,
    sum(
      CASE
        WHEN lower(COALESCE(c.status, ''::text)) <> 'rejected'::text
          THEN COALESCE(c.claim_amount, 0::numeric)
        ELSE 0::numeric
      END
    ) AS submitted_amount,
    sum(
      CASE
        WHEN lower(COALESCE(c.status, ''::text)) = 'rejected'::text
          THEN COALESCE(c.claim_amount, 0::numeric)
        ELSE 0::numeric
      END
    ) AS rejected_amount
  FROM public.claims c
  WHERE c.claim_year IS NOT NULL
    AND c.claim_month BETWEEN 1 AND 12
  GROUP BY c.insurance_company_id, c.claim_year, c.claim_month
),
payment_periods AS (
  SELECT
    COALESCE(c.insurance_company_id, p.insurance_company_id) AS insurance_company_id,
    COALESCE(c.claim_year, p.claim_year) AS period_year,
    COALESCE(c.claim_month, p.claim_month) AS period_month,
    sum(COALESCE(p.amount_paid, 0::numeric)) AS paid_amount,
    count(*) AS payment_entry_count
  FROM public.payments p
  LEFT JOIN public.claims c ON c.id = p.claim_id
  WHERE COALESCE(c.claim_year, p.claim_year) IS NOT NULL
    AND COALESCE(c.claim_month, p.claim_month) BETWEEN 1 AND 12
  GROUP BY
    COALESCE(c.insurance_company_id, p.insurance_company_id),
    COALESCE(c.claim_year, p.claim_year),
    COALESCE(c.claim_month, p.claim_month)
),
tax_periods AS (
  SELECT
    t.insurance_company_id,
    t.year AS period_year,
    t.month AS period_month,
    sum(COALESCE(t.tax_amount, 0::numeric))
      FILTER (WHERE t.is_actual = false) AS provisional_withholding_tax_amount,
    sum(COALESCE(t.tax_amount, 0::numeric))
      FILTER (WHERE t.is_actual = true) AS actual_withholding_tax_amount,
    count(*) FILTER (WHERE t.is_actual = true) AS actual_withholding_tax_entry_count,
    count(*) AS withholding_tax_entry_count
  FROM public.withholding_tax t
  WHERE t.year IS NOT NULL
    AND t.month BETWEEN 1 AND 12
  GROUP BY t.insurance_company_id, t.year, t.month
),
periods AS (
  SELECT insurance_company_id, period_year, period_month FROM claim_periods
  UNION
  SELECT insurance_company_id, period_year, period_month FROM payment_periods
  UNION
  SELECT insurance_company_id, period_year, period_month FROM tax_periods
),
period_values AS (
  SELECT
    p.insurance_company_id,
    p.period_year,
    p.period_month,
    COALESCE(cp.submitted_amount, 0::numeric) AS submitted_amount,
    COALESCE(cp.rejected_amount, 0::numeric) AS rejected_amount,
    COALESCE(pp.paid_amount, 0::numeric) AS paid_amount,
    COALESCE(tp.provisional_withholding_tax_amount, 0::numeric) AS provisional_withholding_tax_amount,
    COALESCE(tp.actual_withholding_tax_amount, 0::numeric) AS actual_withholding_tax_amount,
    COALESCE(tp.actual_withholding_tax_entry_count, 0)::integer AS actual_withholding_tax_entry_count,
    COALESCE(tp.withholding_tax_entry_count, 0)::integer AS withholding_tax_entry_count,
    COALESCE(pp.payment_entry_count, 0)::integer AS payment_entry_count
  FROM periods p
  LEFT JOIN claim_periods cp USING (insurance_company_id, period_year, period_month)
  LEFT JOIN payment_periods pp USING (insurance_company_id, period_year, period_month)
  LEFT JOIN tax_periods tp USING (insurance_company_id, period_year, period_month)
)
SELECT
  insurance_company_id,
  period_year,
  period_month,
  submitted_amount::numeric AS submitted_amount,
  rejected_amount::numeric AS rejected_amount,
  GREATEST(submitted_amount - rejected_amount, 0::numeric)::numeric AS net_claim_amount,
  paid_amount::numeric AS paid_amount,
  CASE
    WHEN actual_withholding_tax_entry_count > 0 THEN actual_withholding_tax_amount
    ELSE provisional_withholding_tax_amount
  END::numeric AS withholding_tax_amount,
  GREATEST(
    submitted_amount - rejected_amount - paid_amount
      - CASE
          WHEN actual_withholding_tax_entry_count > 0 THEN actual_withholding_tax_amount
          ELSE provisional_withholding_tax_amount
        END,
    0::numeric
  )::numeric AS outstanding_amount,
  CASE
    WHEN payment_entry_count > 0 AND actual_withholding_tax_entry_count > 0
      THEN 'actual'::text
    ELSE 'provisional'::text
  END AS outstanding_status,
  payment_entry_count,
  withholding_tax_entry_count,
  provisional_withholding_tax_amount::numeric AS provisional_withholding_tax_amount,
  actual_withholding_tax_amount::numeric AS actual_withholding_tax_amount
FROM period_values;

COMMENT ON VIEW public.claims_outstanding_periods IS
  'Insurer-period outstanding balances. Provisional WHT is shown separately and used only while actual payment-advice WHT is absent. Once actual WHT exists, only actual WHT is used in the confirmed outstanding calculation; provisional estimates are never added to actual tax.';

GRANT SELECT ON public.claims_outstanding_periods TO authenticated;
