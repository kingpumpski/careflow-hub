-- Correct the insurer-period receivable calculation: provisional WHT is an estimate,
-- not a settlement. Only actual WHT confirmed by insurer payment advice reduces
-- the company's outstanding receivable. The WHT display column remains effective
-- WHT (actual when confirmed, provisional estimate otherwise).
-- Use the aggregate insurer-period register as the authoritative submitted/rejected
-- source when present. Individual claim rows remain the fallback for other workflows.
-- Keep provisional estimates and confirmed actual WHT in separate reporting columns.
-- Rejection records are separate events, not additional submitted claim value.
-- The legacy withholding_tax_amount remains as the amount used by the outstanding
-- calculation: provisional while awaiting payment advice, actual once actual WHT
-- entries exist. Provisional estimates are never added to confirmed actual WHT.

CREATE OR REPLACE VIEW public.claims_outstanding_periods
WITH (security_invoker = true)
AS
WITH claim_transaction_periods AS (
  SELECT
    c.insurance_company_id,
    c.claim_year AS period_year,
    c.claim_month AS period_month,
    -- Submitted gross includes every claim that was submitted, including
    -- amounts later rejected. Rejections are reported separately, not removed
    -- from the original submission denominator.
    sum(COALESCE(c.claim_amount, 0::numeric)) AS submitted_amount,
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
settlement_submission_periods AS (
  SELECT
    s.insurance_company_id,
    EXTRACT(YEAR FROM s.period_start)::integer AS period_year,
    EXTRACT(MONTH FROM s.period_start)::integer AS period_month,
    sum(s.total_claims_submitted) AS submitted_amount,
    sum(COALESCE(s.rejection_amount, 0::numeric)) AS rejected_amount,
    CASE WHEN bool_or(s.approved_gross_amount IS NULL) THEN NULL ELSE sum(s.approved_gross_amount) END AS approved_gross_amount,
    count(*) AS settlement_period_count
  FROM public.claims_settlement_periods s
  WHERE s.period_type = 'month'
    AND s.period_start = date_trunc('month', s.period_start)::date
    AND s.period_end = (date_trunc('month', s.period_start) + interval '1 month - 1 day')::date
  GROUP BY s.insurance_company_id, EXTRACT(YEAR FROM s.period_start), EXTRACT(MONTH FROM s.period_start)
),
claim_periods AS (
  SELECT
    COALESCE(sp.insurance_company_id, cp.insurance_company_id) AS insurance_company_id,
    COALESCE(sp.period_year, cp.period_year) AS period_year,
    COALESCE(sp.period_month, cp.period_month) AS period_month,
    CASE WHEN COALESCE(sp.settlement_period_count, 0) > 0
      THEN COALESCE(sp.submitted_amount, 0::numeric)
      ELSE COALESCE(cp.submitted_amount, 0::numeric)
    END AS submitted_amount,
    CASE WHEN COALESCE(sp.settlement_period_count, 0) > 0
      THEN COALESCE(sp.rejected_amount, 0::numeric)
      ELSE COALESCE(cp.rejected_amount, 0::numeric)
    END AS rejected_amount,
    CASE WHEN COALESCE(sp.settlement_period_count, 0) > 0
      THEN sp.approved_gross_amount
      ELSE NULL::numeric
    END AS approved_gross_amount
  FROM settlement_submission_periods sp
  FULL OUTER JOIN claim_transaction_periods cp
    USING (insurance_company_id, period_year, period_month)
),
payment_table_periods AS (
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
settlement_cash_periods AS (
  SELECT
    s.insurance_company_id,
    EXTRACT(YEAR FROM s.period_start)::integer AS period_year,
    EXTRACT(MONTH FROM s.period_start)::integer AS period_month,
    sum(COALESCE(s.payment_received, 0::numeric))
      FILTER (WHERE s.settlement_status IN ('payment_advice_received', 'reconciled') AND s.payment_received IS NOT NULL AND s.actual_withholding_tax IS NOT NULL) AS paid_amount,
    count(*) FILTER (
      WHERE s.settlement_status IN ('payment_advice_received', 'reconciled')
        AND s.payment_received IS NOT NULL
        AND s.actual_withholding_tax IS NOT NULL
    ) AS settlement_payment_entry_count
  FROM public.claims_settlement_periods s
  WHERE s.period_type = 'month'
    AND s.period_start = date_trunc('month', s.period_start)::date
    AND s.period_end = (date_trunc('month', s.period_start) + interval '1 month - 1 day')::date
  GROUP BY s.insurance_company_id, EXTRACT(YEAR FROM s.period_start), EXTRACT(MONTH FROM s.period_start)
),
payment_periods AS (
  SELECT
    COALESCE(sc.insurance_company_id, pt.insurance_company_id) AS insurance_company_id,
    COALESCE(sc.period_year, pt.period_year) AS period_year,
    COALESCE(sc.period_month, pt.period_month) AS period_month,
    CASE
      WHEN COALESCE(sc.settlement_payment_entry_count, 0) > 0
        THEN COALESCE(sc.paid_amount, 0::numeric)
      ELSE COALESCE(pt.paid_amount, 0::numeric)
    END AS paid_amount,
    CASE
      WHEN COALESCE(sc.settlement_payment_entry_count, 0) > 0
        THEN COALESCE(sc.settlement_payment_entry_count, 0)
      ELSE COALESCE(pt.payment_entry_count, 0)
    END AS payment_entry_count
  FROM settlement_cash_periods sc
  FULL OUTER JOIN payment_table_periods pt
    USING (insurance_company_id, period_year, period_month)
),
tax_table_periods AS (
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
settlement_tax_periods AS (
  SELECT
    s.insurance_company_id,
    EXTRACT(YEAR FROM s.period_start)::integer AS period_year,
    EXTRACT(MONTH FROM s.period_start)::integer AS period_month,
    sum(COALESCE(s.provisional_withholding_tax, 0::numeric)) AS provisional_withholding_tax_amount,
    sum(COALESCE(s.actual_withholding_tax, 0::numeric))
      FILTER (WHERE s.settlement_status IN ('payment_advice_received', 'reconciled')) AS actual_withholding_tax_amount,
    count(*) FILTER (
      WHERE s.settlement_status IN ('payment_advice_received', 'reconciled')
        AND s.actual_withholding_tax IS NOT NULL
    ) AS actual_withholding_tax_entry_count,
    count(*) AS settlement_period_count
  FROM public.claims_settlement_periods s
  WHERE s.period_type = 'month'
    AND s.period_start = date_trunc('month', s.period_start)::date
    AND s.period_end = (date_trunc('month', s.period_start) + interval '1 month - 1 day')::date
  GROUP BY s.insurance_company_id, EXTRACT(YEAR FROM s.period_start), EXTRACT(MONTH FROM s.period_start)
),
tax_periods AS (
  SELECT
    COALESCE(st.insurance_company_id, tt.insurance_company_id) AS insurance_company_id,
    COALESCE(st.period_year, tt.period_year) AS period_year,
    COALESCE(st.period_month, tt.period_month) AS period_month,
    CASE
      WHEN COALESCE(st.settlement_period_count, 0) > 0
        THEN COALESCE(st.provisional_withholding_tax_amount, 0::numeric)
      ELSE COALESCE(tt.provisional_withholding_tax_amount, 0::numeric)
    END AS provisional_withholding_tax_amount,
    CASE
      WHEN COALESCE(st.actual_withholding_tax_entry_count, 0) > 0
        THEN COALESCE(st.actual_withholding_tax_amount, 0::numeric)
      ELSE COALESCE(tt.actual_withholding_tax_amount, 0::numeric)
    END AS actual_withholding_tax_amount,
    CASE
      WHEN COALESCE(st.actual_withholding_tax_entry_count, 0) > 0
        THEN st.actual_withholding_tax_entry_count
      ELSE COALESCE(tt.actual_withholding_tax_entry_count, 0)
    END AS actual_withholding_tax_entry_count,
    CASE
      WHEN COALESCE(st.settlement_period_count, 0) > 0
        THEN st.settlement_period_count
      ELSE COALESCE(tt.withholding_tax_entry_count, 0)
    END AS withholding_tax_entry_count
  FROM settlement_tax_periods st
  FULL OUTER JOIN tax_table_periods tt
    USING (insurance_company_id, period_year, period_month)
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
    cp.approved_gross_amount AS approved_gross_amount,
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
  COALESCE(approved_gross_amount, GREATEST(submitted_amount - rejected_amount, 0::numeric))::numeric AS net_claim_amount,
  paid_amount::numeric AS paid_amount,
  CASE
    WHEN actual_withholding_tax_entry_count > 0 THEN actual_withholding_tax_amount
    ELSE provisional_withholding_tax_amount
  END::numeric AS withholding_tax_amount,
  GREATEST(
    COALESCE(approved_gross_amount, submitted_amount - rejected_amount) - paid_amount
      - actual_withholding_tax_amount,
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
  actual_withholding_tax_amount::numeric AS actual_withholding_tax_amount,
  approved_gross_amount::numeric AS approved_gross_amount,
  CASE WHEN approved_gross_amount IS NULL THEN NULL::numeric
    ELSE round(submitted_amount - approved_gross_amount - rejected_amount, 2)
  END::numeric AS approval_variance,
  CASE WHEN approved_gross_amount IS NULL THEN NULL::numeric
    ELSE round(approved_gross_amount - paid_amount - actual_withholding_tax_amount, 2)
  END::numeric AS approved_unpaid_balance
FROM period_values;

COMMENT ON VIEW public.claims_outstanding_periods IS
  'Insurer-period outstanding balances. Provisional WHT is displayed as an estimate only and never reduces outstanding receivables. Only confirmed actual WHT from insurer payment advice reduces the outstanding balance. Monthly settlement-period advice is the preferred actual-WHT source for the monthly claims view.';

GRANT SELECT ON public.claims_outstanding_periods TO authenticated;


