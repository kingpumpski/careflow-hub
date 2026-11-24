-- Keep the monthly claim, provisional WHT and ledger postings in one transaction.
-- The exposed public wrappers remain SECURITY INVOKER. Private SECURITY DEFINER
-- helpers perform fixed system-generated postings only after checking auth.uid(),
-- claims.write and the dedicated claims.submit_monthly permission.
--
-- The internal WHT helper exposes only the configured rate to an authenticated
-- caller. It does not expose the system_settings table or accept a client rate.

CREATE OR REPLACE FUNCTION security_internal.configured_withholding_tax_rate()
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rate numeric;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to read the configured withholding-tax rate.'
      USING ERRCODE = '42501';
  END IF;

  SELECT NULLIF(pg_catalog.btrim(s.value), '')::numeric
    INTO v_rate
    FROM public.system_settings AS s
   WHERE s.key = 'withholding_tax_rate';

  IF NOT FOUND OR v_rate IS NULL THEN
    RAISE EXCEPTION 'No withholding-tax rate is configured. An authorized administrator must configure the approved rate before monthly claims can be submitted.'
      USING ERRCODE = '55000';
  END IF;

  IF v_rate < 0 OR v_rate > 100 THEN
    RAISE EXCEPTION 'The configured withholding-tax rate must be between 0 and 100.'
      USING ERRCODE = '22023';
  END IF;

  RETURN v_rate;
END;
$$;

REVOKE ALL ON FUNCTION security_internal.configured_withholding_tax_rate() FROM PUBLIC, anon, authenticated;

-- A monthly aggregate submission creates fixed, server-derived WHT and ledger
-- side effects. Grant this narrowly scoped capability to claims roles without
-- granting those users arbitrary payment or ledger write access.
INSERT INTO public.app_permissions (permission_key, label, description)
VALUES (
  'claims.submit_monthly',
  'Submit monthly claims',
  'Submit insurer-level monthly claim totals with their system-generated provisional WHT and ledger postings.'
)
ON CONFLICT (permission_key) DO UPDATE
SET label = EXCLUDED.label, description = EXCLUDED.description;

INSERT INTO public.role_permissions (role, permission_key)
VALUES
  ('superuser', 'claims.submit_monthly'),
  ('admin', 'claims.submit_monthly'),
  ('claims_officer', 'claims.submit_monthly'),
  ('data_entry_officer', 'claims.submit_monthly')
ON CONFLICT (role, permission_key) DO NOTHING;

CREATE OR REPLACE FUNCTION security_internal.submit_monthly_claim_atomic(
  p_insurance_company_id uuid,
  p_claim_amount numeric,
  p_claim_month integer,
  p_claim_year integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim_id uuid;
  v_tax_rate numeric;
  v_tax_amount numeric;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to submit a monthly claim.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT security_internal.current_user_has_permission('claims.write')
     OR NOT security_internal.current_user_has_permission('claims.submit_monthly') THEN
    RAISE EXCEPTION 'claims.write and claims.submit_monthly permissions are required.'
      USING ERRCODE = '42501';
  END IF;

  IF p_insurance_company_id IS NULL THEN
    RAISE EXCEPTION 'An insurance company is required.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.insurance_companies
    WHERE id = p_insurance_company_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Select an active insurance company.'
      USING ERRCODE = '22023';
  END IF;

  IF p_claim_amount IS NULL
     OR p_claim_amount <= 0
     OR p_claim_amount <> ROUND(p_claim_amount, 2)
     OR p_claim_amount::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Claim amount must be positive and have no more than two decimal places.'
      USING ERRCODE = '22023';
  END IF;

  IF p_claim_month IS NULL OR p_claim_month < 1 OR p_claim_month > 12 THEN
    RAISE EXCEPTION 'Claim month must be between 1 and 12.'
      USING ERRCODE = '22023';
  END IF;

  IF p_claim_year IS NULL OR p_claim_year < 1 OR p_claim_year > 9999 THEN
    RAISE EXCEPTION 'Claim year must be between 1 and 9999.'
      USING ERRCODE = '22023';
  END IF;

  v_tax_rate := security_internal.configured_withholding_tax_rate();
  v_tax_amount := ROUND((p_claim_amount * v_tax_rate) / 100, 2);

  INSERT INTO public.claims (
    insurance_company_id,
    claim_amount,
    claim_month,
    claim_year,
    status
  ) VALUES (
    p_insurance_company_id,
    p_claim_amount,
    p_claim_month,
    p_claim_year,
    'submitted'
  )
  RETURNING id INTO v_claim_id;

  INSERT INTO public.withholding_tax (
    insurance_company_id,
    month,
    year,
    claim_total,
    tax_rate,
    tax_amount,
    is_actual
  ) VALUES (
    p_insurance_company_id,
    p_claim_month,
    p_claim_year,
    p_claim_amount,
    v_tax_rate,
    v_tax_amount,
    false
  );

  INSERT INTO public.ledger_entries (
    account_debit,
    account_credit,
    amount,
    reference,
    description,
    insurance_company_id,
    claim_month,
    claim_year,
    entry_type
  ) VALUES
    (
      'Accounts Receivable',
      'Claims Revenue',
      p_claim_amount,
      'Claim ' || p_claim_month::text || '/' || p_claim_year::text,
      'Monthly claim submission',
      p_insurance_company_id,
      p_claim_month,
      p_claim_year,
      'claim_submission'
    ),
    (
      'WHT Expense',
      'WHT Payable',
      v_tax_amount,
      'WHT ' || p_claim_month::text || '/' || p_claim_year::text,
      'Withholding tax on claim',
      p_insurance_company_id,
      p_claim_month,
      p_claim_year,
      'withholding_tax'
    );

  RETURN jsonb_build_object(
    'claim_id', v_claim_id,
    'tax_rate', v_tax_rate,
    'tax_amount', v_tax_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION security_internal.submit_monthly_claim_atomic(uuid, numeric, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION security_internal.submit_monthly_claim_atomic(uuid, numeric, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_monthly_claim_atomic(
  p_insurance_company_id uuid,
  p_claim_amount numeric,
  p_claim_month integer,
  p_claim_year integer
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $wrapper$
  SELECT security_internal.submit_monthly_claim_atomic(
    p_insurance_company_id, p_claim_amount, p_claim_month, p_claim_year
  );
$wrapper$;

REVOKE ALL ON FUNCTION public.submit_monthly_claim_atomic(uuid, numeric, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_monthly_claim_atomic(uuid, numeric, integer, integer) TO authenticated;

-- Rejections are recorded separately from submitted claims. They must not
-- create a negative provisional WHT row: the original provisional estimate stays
-- based on the full submitted amount, while actual WHT is recorded from payment
-- advice on the insurer-approved gross amount.
CREATE OR REPLACE FUNCTION security_internal.submit_claim_rejection_atomic(
  p_insurance_company_id uuid,
  p_rejected_amount numeric,
  p_claim_month integer,
  p_claim_year integer,
  p_denial_category text DEFAULT NULL,
  p_denial_reason text DEFAULT NULL,
  p_root_cause text DEFAULT NULL,
  p_denial_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to record a claim rejection.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT security_internal.current_user_has_permission('claims.write')
     OR NOT security_internal.current_user_has_permission('claims.submit_monthly') THEN
    RAISE EXCEPTION 'claims.write and claims.submit_monthly permissions are required.'
      USING ERRCODE = '42501';
  END IF;

  IF p_insurance_company_id IS NULL THEN
    RAISE EXCEPTION 'An insurance company is required.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.insurance_companies
    WHERE id = p_insurance_company_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Select an active insurance company.'
      USING ERRCODE = '22023';
  END IF;

  IF p_rejected_amount IS NULL
     OR p_rejected_amount <= 0
     OR p_rejected_amount <> ROUND(p_rejected_amount, 2)
     OR p_rejected_amount::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Rejected amount must be positive and have no more than two decimal places.'
      USING ERRCODE = '22023';
  END IF;

  IF p_claim_month IS NULL OR p_claim_month < 1 OR p_claim_month > 12 THEN
    RAISE EXCEPTION 'Claim month must be between 1 and 12.'
      USING ERRCODE = '22023';
  END IF;

  IF p_claim_year IS NULL OR p_claim_year < 1 OR p_claim_year > 9999 THEN
    RAISE EXCEPTION 'Claim year must be between 1 and 9999.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.claims (
    insurance_company_id,
    claim_amount,
    claim_month,
    claim_year,
    status,
    denial_category,
    denial_reason,
    root_cause,
    denial_notes,
    appeal_status
  ) VALUES (
    p_insurance_company_id,
    p_rejected_amount,
    p_claim_month,
    p_claim_year,
    'rejected',
    NULLIF(BTRIM(p_denial_category), ''),
    NULLIF(BTRIM(p_denial_reason), ''),
    NULLIF(BTRIM(p_root_cause), ''),
    NULLIF(BTRIM(p_denial_notes), ''),
    'not_filed'
  )
  RETURNING id INTO v_claim_id;

  INSERT INTO public.ledger_entries (
    account_debit,
    account_credit,
    amount,
    reference,
    description,
    insurance_company_id,
    claim_month,
    claim_year,
    entry_type
  ) VALUES (
    'Revenue Adjustment',
    'Accounts Receivable',
    p_rejected_amount,
    'Rejection ' || p_claim_month::text || '/' || p_claim_year::text,
    'Claim rejection',
    p_insurance_company_id,
    p_claim_month,
    p_claim_year,
    'rejection'
  );

  RETURN jsonb_build_object(
    'claim_id', v_claim_id,
    'rejected_amount', p_rejected_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION security_internal.submit_claim_rejection_atomic(uuid, numeric, integer, integer, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION security_internal.submit_claim_rejection_atomic(uuid, numeric, integer, integer, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_claim_rejection_atomic(
  p_insurance_company_id uuid,
  p_rejected_amount numeric,
  p_claim_month integer,
  p_claim_year integer,
  p_denial_category text DEFAULT NULL,
  p_denial_reason text DEFAULT NULL,
  p_root_cause text DEFAULT NULL,
  p_denial_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $wrapper$
  SELECT security_internal.submit_claim_rejection_atomic(
    p_insurance_company_id, p_rejected_amount, p_claim_month, p_claim_year,
    p_denial_category, p_denial_reason, p_root_cause, p_denial_notes
  );
$wrapper$;

REVOKE ALL ON FUNCTION public.submit_claim_rejection_atomic(uuid, numeric, integer, integer, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_claim_rejection_atomic(uuid, numeric, integer, integer, text, text, text, text) TO authenticated;

-- Rejected monthly claim amounts are already removed from net_claim_amount.
-- Their negative provisional WHT rows reverse tax on the rejected portion of a
-- previously submitted aggregate. Never allow those reversals to make the
-- period's net WHT negative, which would otherwise create a phantom balance.
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
    count(*) FILTER (WHERE t.is_actual = true) AS actual_withholding_tax_entry_count
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
)
SELECT
  p.insurance_company_id,
  p.period_year,
  p.period_month,
  COALESCE(cp.submitted_amount, 0::numeric) AS submitted_amount,
  COALESCE(cp.rejected_amount, 0::numeric) AS rejected_amount,
  GREATEST(COALESCE(cp.submitted_amount, 0::numeric) - COALESCE(cp.rejected_amount, 0::numeric), 0::numeric) AS net_claim_amount,
  COALESCE(pp.paid_amount, 0::numeric) AS paid_amount,
  CASE
    WHEN COALESCE(tp.actual_withholding_tax_entry_count, 0) > 0
      THEN COALESCE(tp.actual_withholding_tax_amount, 0::numeric)
    ELSE COALESCE(tp.provisional_withholding_tax_amount, 0::numeric)
  END AS withholding_tax_amount,
  GREATEST(
    COALESCE(cp.submitted_amount, 0::numeric)
      - COALESCE(cp.rejected_amount, 0::numeric)
      - COALESCE(pp.paid_amount, 0::numeric)
      - CASE
          WHEN COALESCE(tp.actual_withholding_tax_entry_count, 0) > 0
            THEN COALESCE(tp.actual_withholding_tax_amount, 0::numeric)
          ELSE COALESCE(tp.provisional_withholding_tax_amount, 0::numeric)
        END,
    0::numeric
  ) AS outstanding_amount,
  CASE
    WHEN COALESCE(pp.payment_entry_count, 0) > 0
      AND COALESCE(tp.actual_withholding_tax_entry_count, 0) > 0
      THEN 'actual'::text
    ELSE 'provisional'::text
  END AS outstanding_status,
  COALESCE(pp.payment_entry_count, 0)::integer AS payment_entry_count,
  COALESCE(tp.actual_withholding_tax_entry_count, 0)::integer AS withholding_tax_entry_count
FROM periods p
LEFT JOIN claim_periods cp USING (insurance_company_id, period_year, period_month)
LEFT JOIN payment_periods pp USING (insurance_company_id, period_year, period_month)
LEFT JOIN tax_periods tp USING (insurance_company_id, period_year, period_month);
