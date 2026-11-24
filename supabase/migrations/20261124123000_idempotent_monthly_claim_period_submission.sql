-- One insurer/facility/monthly aggregate submission per claims cycle.
-- This closes the gap between a successful database commit and a lost client
-- response: retrying with the same idempotency key returns the original result,
-- while a different key cannot post the same period twice.
-- A matching awaiting-payment settlement period is linked; a conflicting or
-- already-advised period is never silently overwritten.

-- Never silently apply the historical 5% column default to a new period.
ALTER TABLE public.claims_settlement_periods
  ALTER COLUMN withholding_tax_rate DROP DEFAULT;

CREATE TABLE public.monthly_claim_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
  insurance_company_id UUID NOT NULL REFERENCES public.insurance_companies(id) ON DELETE RESTRICT,
  claim_year INTEGER NOT NULL CHECK (claim_year BETWEEN 1 AND 9999),
  claim_month INTEGER NOT NULL CHECK (claim_month BETWEEN 1 AND 12),
  submitted_amount NUMERIC(14,2) NOT NULL CHECK (submitted_amount > 0),
  provisional_wht_rate NUMERIC(7,4) NOT NULL CHECK (provisional_wht_rate BETWEEN 0 AND 100),
  provisional_wht_amount NUMERIC(14,2) NOT NULL CHECK (provisional_wht_amount >= 0),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE RESTRICT,
  settlement_period_id UUID NOT NULL REFERENCES public.claims_settlement_periods(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT monthly_claim_submission_period_once UNIQUE (facility_id, insurance_company_id, claim_year, claim_month),
  CONSTRAINT monthly_claim_submission_idempotency_once UNIQUE (facility_id, idempotency_key)
);

CREATE INDEX monthly_claim_submissions_facility_period_idx
  ON public.monthly_claim_submissions(facility_id, claim_year DESC, claim_month DESC);

ALTER TABLE public.monthly_claim_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS monthly_claim_submissions_read ON public.monthly_claim_submissions;
CREATE POLICY monthly_claim_submissions_read
  ON public.monthly_claim_submissions FOR SELECT TO authenticated
  USING (
    security_internal.user_has_facility_access(facility_id)
    AND security_internal.current_user_has_permission('claims.read')
  );

REVOKE ALL ON TABLE public.monthly_claim_submissions FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.monthly_claim_submissions FROM authenticated;
GRANT SELECT ON TABLE public.monthly_claim_submissions TO authenticated;

CREATE OR REPLACE FUNCTION security_internal.reject_monthly_claim_submission_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Monthly claim submissions are immutable; use a separately authorized correction workflow.';
END;
$$;

DROP TRIGGER IF EXISTS monthly_claim_submissions_immutable ON public.monthly_claim_submissions;
CREATE TRIGGER monthly_claim_submissions_immutable
  BEFORE UPDATE OR DELETE ON public.monthly_claim_submissions
  FOR EACH ROW EXECUTE FUNCTION security_internal.reject_monthly_claim_submission_mutation();

-- Replace the earlier facility-scoped RPC with an idempotent six-argument contract.
DROP FUNCTION IF EXISTS public.submit_monthly_claim_atomic(UUID, NUMERIC, INTEGER, INTEGER, UUID);
DROP FUNCTION IF EXISTS security_internal.submit_monthly_claim_atomic(UUID, NUMERIC, INTEGER, INTEGER, UUID);

CREATE OR REPLACE FUNCTION security_internal.submit_monthly_claim_atomic(
  p_insurance_company_id UUID,
  p_claim_amount NUMERIC,
  p_claim_month INTEGER,
  p_claim_year INTEGER,
  p_facility_id UUID,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_claim_id UUID;
  v_tax_rate NUMERIC;
  v_tax_amount NUMERIC;
  v_insurer_facility_id UUID;
  v_period_start DATE;
  v_period_end DATE;
  v_settlement_period_id UUID;
  v_existing public.monthly_claim_submissions%ROWTYPE;
  v_settlement public.claims_settlement_periods%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to submit a monthly claim.'
      USING ERRCODE = '42501';
  END IF;
  IF NOT security_internal.current_user_has_permission('claims.write')
     OR NOT security_internal.current_user_has_permission('claims.submit_monthly') THEN
    RAISE EXCEPTION 'claims.write and claims.submit_monthly permissions are required.'
      USING ERRCODE = '42501';
  END IF;
  IF p_facility_id IS NULL OR NOT security_internal.user_has_facility_access(p_facility_id) THEN
    RAISE EXCEPTION 'Active membership in the selected facility is required.'
      USING ERRCODE = '42501';
  END IF;
  IF p_insurance_company_id IS NULL THEN
    RAISE EXCEPTION 'An insurance company is required.'
      USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NULL
     OR length(pg_catalog.btrim(p_idempotency_key)) < 8
     OR length(p_idempotency_key) > 200 THEN
    RAISE EXCEPTION 'A valid monthly-claim idempotency key is required.'
      USING ERRCODE = '22023';
  END IF;

  SELECT i.facility_id INTO v_insurer_facility_id
    FROM public.insurance_companies AS i
   WHERE i.id = p_insurance_company_id
     AND i.is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Select an active insurance company.'
      USING ERRCODE = '22023';
  END IF;
  IF v_insurer_facility_id IS DISTINCT FROM p_facility_id THEN
    RAISE EXCEPTION 'The selected insurance company does not belong to the active facility.'
      USING ERRCODE = '42501';
  END IF;

  IF p_claim_amount IS NULL
     OR p_claim_amount <= 0
     OR p_claim_amount <> ROUND(p_claim_amount, 2)
     OR p_claim_amount::TEXT IN ('NaN', 'Infinity', '-Infinity') THEN
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

  v_period_start := pg_catalog.make_date(p_claim_year, p_claim_month, 1);
  v_period_end := (v_period_start + INTERVAL '1 month - 1 day')::DATE;

  -- Serialize retries using the same key before checking the unique period.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('monthly-claim-idempotency:' || p_facility_id::TEXT || ':' || pg_catalog.btrim(p_idempotency_key), 0)
  );
  SELECT * INTO v_existing
    FROM public.monthly_claim_submissions
   WHERE facility_id = p_facility_id
     AND idempotency_key = pg_catalog.btrim(p_idempotency_key)
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing.insurance_company_id IS DISTINCT FROM p_insurance_company_id
       OR v_existing.claim_year IS DISTINCT FROM p_claim_year
       OR v_existing.claim_month IS DISTINCT FROM p_claim_month
       OR v_existing.submitted_amount IS DISTINCT FROM p_claim_amount THEN
      RAISE EXCEPTION 'The monthly-claim idempotency key was reused with different submission details.'
        USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'claim_id', v_existing.claim_id,
      'tax_rate', v_existing.provisional_wht_rate,
      'tax_amount', v_existing.provisional_wht_amount,
      'facility_id', v_existing.facility_id,
      'settlement_period_id', v_existing.settlement_period_id,
      'idempotent', true
    );
  END IF;

  -- A different key cannot create a second submission for the same monthly cycle.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'monthly-claim-period:' || p_facility_id::TEXT || ':' || p_insurance_company_id::TEXT || ':' || p_claim_year::TEXT || ':' || p_claim_month::TEXT,
      0
    )
  );
  IF EXISTS (
    SELECT 1 FROM public.monthly_claim_submissions
     WHERE facility_id = p_facility_id
       AND insurance_company_id = p_insurance_company_id
       AND claim_year = p_claim_year
       AND claim_month = p_claim_month
  ) THEN
    RAISE EXCEPTION 'This facility and insurer monthly claims period has already been submitted. Review the existing period instead of posting it again.'
      USING ERRCODE = '23505';
  END IF;

  v_tax_rate := security_internal.configured_withholding_tax_rate(p_facility_id);
  v_tax_amount := ROUND((p_claim_amount * v_tax_rate) / 100, 2);

  -- Link the aggregate submission to its month-to-month settlement cycle.
  -- A manually entered period is accepted only when its source figures agree.
  SELECT * INTO v_settlement
    FROM public.claims_settlement_periods
   WHERE facility_id = p_facility_id
     AND insurance_company_id = p_insurance_company_id
     AND period_start = v_period_start
     AND period_end = v_period_end
     AND period_type = 'month'
   FOR UPDATE;

  IF FOUND THEN
    IF v_settlement.settlement_status <> 'awaiting_payment'
       OR v_settlement.total_claims_submitted IS DISTINCT FROM p_claim_amount
       OR v_settlement.withholding_tax_rate IS DISTINCT FROM v_tax_rate THEN
      RAISE EXCEPTION 'A settlement period already exists with different figures or recorded payment advice. Review the period before submitting this monthly claim.'
        USING ERRCODE = '23505';
    END IF;
    v_settlement_period_id := v_settlement.id;
  ELSE
    INSERT INTO public.claims_settlement_periods (
      facility_id, insurance_company_id, period_start, period_end, period_type,
      total_claims_submitted, withholding_tax_rate, settlement_status, created_by
    ) VALUES (
      p_facility_id, p_insurance_company_id, v_period_start, v_period_end, 'month',
      p_claim_amount, v_tax_rate, 'awaiting_payment', v_actor
    )
    ON CONFLICT (facility_id, insurance_company_id, period_start, period_end) DO NOTHING
    RETURNING id INTO v_settlement_period_id;

    IF v_settlement_period_id IS NULL THEN
      SELECT * INTO v_settlement
        FROM public.claims_settlement_periods
       WHERE facility_id = p_facility_id
         AND insurance_company_id = p_insurance_company_id
         AND period_start = v_period_start
         AND period_end = v_period_end
         AND period_type = 'month'
       FOR UPDATE;
      IF NOT FOUND
         OR v_settlement.settlement_status <> 'awaiting_payment'
         OR v_settlement.total_claims_submitted IS DISTINCT FROM p_claim_amount
         OR v_settlement.withholding_tax_rate IS DISTINCT FROM v_tax_rate THEN
        RAISE EXCEPTION 'A conflicting settlement period already exists. Review it before submitting this monthly claim.'
          USING ERRCODE = '23505';
      END IF;
      v_settlement_period_id := v_settlement.id;
    END IF;
  END IF;

  INSERT INTO public.claims (
    facility_id, insurance_company_id, claim_amount, claim_month, claim_year, status
  ) VALUES (
    p_facility_id, p_insurance_company_id, p_claim_amount, p_claim_month, p_claim_year, 'submitted'
  )
  RETURNING id INTO v_claim_id;

  INSERT INTO public.withholding_tax (
    facility_id, insurance_company_id, month, year, claim_total, tax_rate, tax_amount, is_actual
  ) VALUES (
    p_facility_id, p_insurance_company_id, p_claim_month, p_claim_year,
    p_claim_amount, v_tax_rate, v_tax_amount, false
  );

  INSERT INTO public.ledger_entries (
    facility_id, account_debit, account_credit, amount, reference, description,
    insurance_company_id, claim_month, claim_year, entry_type
  ) VALUES
    (
      p_facility_id, 'Accounts Receivable', 'Claims Revenue', p_claim_amount,
      'Claim ' || p_claim_month::TEXT || '/' || p_claim_year::TEXT,
      'Monthly claim submission', p_insurance_company_id, p_claim_month, p_claim_year, 'claim_submission'
    ),
    (
      p_facility_id, 'WHT Expense', 'WHT Payable', v_tax_amount,
      'WHT ' || p_claim_month::TEXT || '/' || p_claim_year::TEXT,
      'Provisional withholding tax on submitted claims',
      p_insurance_company_id, p_claim_month, p_claim_year, 'withholding_tax'
    );

  INSERT INTO public.monthly_claim_submissions (
    facility_id, insurance_company_id, claim_year, claim_month, submitted_amount,
    provisional_wht_rate, provisional_wht_amount, idempotency_key, claim_id,
    settlement_period_id, created_by
  ) VALUES (
    p_facility_id, p_insurance_company_id, p_claim_year, p_claim_month, p_claim_amount,
    v_tax_rate, v_tax_amount, pg_catalog.btrim(p_idempotency_key), v_claim_id,
    v_settlement_period_id, v_actor
  );

  RETURN jsonb_build_object(
    'claim_id', v_claim_id,
    'tax_rate', v_tax_rate,
    'tax_amount', v_tax_amount,
    'facility_id', p_facility_id,
    'settlement_period_id', v_settlement_period_id,
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION security_internal.submit_monthly_claim_atomic(UUID, NUMERIC, INTEGER, INTEGER, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION security_internal.submit_monthly_claim_atomic(UUID, NUMERIC, INTEGER, INTEGER, UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_monthly_claim_atomic(
  p_insurance_company_id UUID,
  p_claim_amount NUMERIC,
  p_claim_month INTEGER,
  p_claim_year INTEGER,
  p_facility_id UUID,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE SQL
SECURITY INVOKER
SET search_path = ''
AS $wrapper$
  SELECT security_internal.submit_monthly_claim_atomic(
    p_insurance_company_id, p_claim_amount, p_claim_month, p_claim_year, p_facility_id, p_idempotency_key
  );
$wrapper$;

REVOKE ALL ON FUNCTION public.submit_monthly_claim_atomic(UUID, NUMERIC, INTEGER, INTEGER, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_monthly_claim_atomic(UUID, NUMERIC, INTEGER, INTEGER, UUID, TEXT) TO authenticated;

COMMENT ON TABLE public.monthly_claim_submissions IS
  'Immutable facility/insurer/month aggregate submission ledger. Each period is posted once and linked to its settlement cycle.';
COMMENT ON FUNCTION public.submit_monthly_claim_atomic(UUID, NUMERIC, INTEGER, INTEGER, UUID, TEXT) IS
  'Atomically posts one facility-scoped monthly aggregate claim, facility-approved provisional WHT, ledger entries and settlement period; same-key retries return the original result without duplicate postings.';
