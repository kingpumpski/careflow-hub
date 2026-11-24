-- Facility-scoped monthly claim posting.
-- A client-selected facility is never trusted on its own: every RPC verifies
-- active membership and confirms that the insurer belongs to that facility.
-- The provisional WHT rate is read only from the owning facility's settings;
-- an absent/invalid rate fails closed. No global or statutory fallback exists.

ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS ledger_entries_facility_created_idx
  ON public.ledger_entries(facility_id, created_at DESC);

DROP POLICY IF EXISTS "Permission read ledger entries" ON public.ledger_entries;
DROP POLICY IF EXISTS "Permission insert ledger entries" ON public.ledger_entries;
DROP POLICY IF EXISTS "Permission update ledger entries" ON public.ledger_entries;
DROP POLICY IF EXISTS "Permission delete ledger entries" ON public.ledger_entries;

CREATE POLICY ledger_entries_facility_read
  ON public.ledger_entries FOR SELECT TO authenticated
  USING (
    facility_id IS NOT NULL
    AND public.user_has_facility_access(facility_id)
    AND (
      public.current_user_has_permission('ledger.read')
      OR public.current_user_has_permission('reports.read')
    )
  );
CREATE POLICY ledger_entries_facility_insert
  ON public.ledger_entries FOR INSERT TO authenticated
  WITH CHECK (
    facility_id IS NOT NULL
    AND public.user_has_facility_access(facility_id)
    AND public.current_user_has_permission('ledger.write')
  );
CREATE POLICY ledger_entries_facility_update
  ON public.ledger_entries FOR UPDATE TO authenticated
  USING (
    facility_id IS NOT NULL
    AND public.user_has_facility_access(facility_id)
    AND public.current_user_has_permission('ledger.write')
  )
  WITH CHECK (
    facility_id IS NOT NULL
    AND public.user_has_facility_access(facility_id)
    AND public.current_user_has_permission('ledger.write')
  );
CREATE POLICY ledger_entries_facility_delete
  ON public.ledger_entries FOR DELETE TO authenticated
  USING (
    facility_id IS NOT NULL
    AND public.user_has_facility_access(facility_id)
    AND public.current_user_has_permission('ledger.write')
  );

-- Remove the older unscoped RPC signatures so callers cannot bypass the
-- facility-aware entry points.
DROP FUNCTION IF EXISTS public.submit_monthly_claim_atomic(UUID, NUMERIC, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS security_internal.submit_monthly_claim_atomic(UUID, NUMERIC, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.submit_claim_rejection_atomic(UUID, NUMERIC, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS security_internal.submit_claim_rejection_atomic(UUID, NUMERIC, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS security_internal.configured_withholding_tax_rate();

CREATE OR REPLACE FUNCTION security_internal.configured_withholding_tax_rate(p_facility_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rate NUMERIC;
  v_raw_rate TEXT;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to read the facility withholding-tax rate.'
      USING ERRCODE = '42501';
  END IF;
  IF p_facility_id IS NULL OR NOT public.user_has_facility_access(p_facility_id) THEN
    RAISE EXCEPTION 'Active membership in the selected facility is required.'
      USING ERRCODE = '42501';
  END IF;

  SELECT f.settings->>'withholding_tax_rate'
    INTO v_raw_rate
    FROM public.facilities AS f
   WHERE f.id = p_facility_id
     AND f.active = true;

  IF NOT FOUND OR NULLIF(pg_catalog.btrim(v_raw_rate), '') IS NULL THEN
    RAISE EXCEPTION 'No approved provisional WHT rate is configured for this facility. An authorized administrator must configure it before claims can be submitted.'
      USING ERRCODE = '55000';
  END IF;

  BEGIN
    v_rate := NULLIF(pg_catalog.btrim(v_raw_rate), '')::NUMERIC;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'The facility provisional WHT rate is invalid. An authorized administrator must correct it.'
      USING ERRCODE = '22023';
  END;

  IF v_rate < 0 OR v_rate > 100 THEN
    RAISE EXCEPTION 'The facility provisional WHT rate must be between 0 and 100.'
      USING ERRCODE = '22023';
  END IF;

  RETURN v_rate;
END;
$$;

REVOKE ALL ON FUNCTION security_internal.configured_withholding_tax_rate(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION security_internal.submit_monthly_claim_atomic(
  p_insurance_company_id UUID,
  p_claim_amount NUMERIC,
  p_claim_month INTEGER,
  p_claim_year INTEGER,
  p_facility_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim_id UUID;
  v_tax_rate NUMERIC;
  v_tax_amount NUMERIC;
  v_insurer_facility_id UUID;
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
  IF p_facility_id IS NULL OR NOT public.user_has_facility_access(p_facility_id) THEN
    RAISE EXCEPTION 'Active membership in the selected facility is required.'
      USING ERRCODE = '42501';
  END IF;
  IF p_insurance_company_id IS NULL THEN
    RAISE EXCEPTION 'An insurance company is required.'
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

  v_tax_rate := security_internal.configured_withholding_tax_rate(p_facility_id);
  v_tax_amount := ROUND((p_claim_amount * v_tax_rate) / 100, 2);

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

  RETURN jsonb_build_object(
    'claim_id', v_claim_id,
    'tax_rate', v_tax_rate,
    'tax_amount', v_tax_amount,
    'facility_id', p_facility_id
  );
END;
$$;

REVOKE ALL ON FUNCTION security_internal.submit_monthly_claim_atomic(UUID, NUMERIC, INTEGER, INTEGER, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION security_internal.submit_monthly_claim_atomic(UUID, NUMERIC, INTEGER, INTEGER, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_monthly_claim_atomic(
  p_insurance_company_id UUID,
  p_claim_amount NUMERIC,
  p_claim_month INTEGER,
  p_claim_year INTEGER,
  p_facility_id UUID
)
RETURNS JSONB
LANGUAGE SQL
SECURITY INVOKER
SET search_path = ''
AS $wrapper$
  SELECT security_internal.submit_monthly_claim_atomic(
    p_insurance_company_id, p_claim_amount, p_claim_month, p_claim_year, p_facility_id
  );
$wrapper$;

REVOKE ALL ON FUNCTION public.submit_monthly_claim_atomic(UUID, NUMERIC, INTEGER, INTEGER, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_monthly_claim_atomic(UUID, NUMERIC, INTEGER, INTEGER, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION security_internal.submit_claim_rejection_atomic(
  p_insurance_company_id UUID,
  p_rejected_amount NUMERIC,
  p_claim_month INTEGER,
  p_claim_year INTEGER,
  p_denial_category TEXT DEFAULT NULL,
  p_denial_reason TEXT DEFAULT NULL,
  p_root_cause TEXT DEFAULT NULL,
  p_denial_notes TEXT DEFAULT NULL,
  p_facility_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim_id UUID;
  v_insurer_facility_id UUID;
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
  IF p_facility_id IS NULL OR NOT public.user_has_facility_access(p_facility_id) THEN
    RAISE EXCEPTION 'Active membership in the selected facility is required.'
      USING ERRCODE = '42501';
  END IF;
  IF p_insurance_company_id IS NULL THEN
    RAISE EXCEPTION 'An insurance company is required.'
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

  IF p_rejected_amount IS NULL
     OR p_rejected_amount <= 0
     OR p_rejected_amount <> ROUND(p_rejected_amount, 2)
     OR p_rejected_amount::TEXT IN ('NaN', 'Infinity', '-Infinity') THEN
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
    facility_id, insurance_company_id, claim_amount, claim_month, claim_year,
    status, denial_category, denial_reason, root_cause, denial_notes, appeal_status
  ) VALUES (
    p_facility_id, p_insurance_company_id, p_rejected_amount, p_claim_month, p_claim_year,
    'rejected', NULLIF(BTRIM(p_denial_category), ''), NULLIF(BTRIM(p_denial_reason), ''),
    NULLIF(BTRIM(p_root_cause), ''), NULLIF(BTRIM(p_denial_notes), ''), 'not_filed'
  )
  RETURNING id INTO v_claim_id;

  INSERT INTO public.ledger_entries (
    facility_id, account_debit, account_credit, amount, reference, description,
    insurance_company_id, claim_month, claim_year, entry_type
  ) VALUES (
    p_facility_id, 'Revenue Adjustment', 'Accounts Receivable', p_rejected_amount,
    'Rejection ' || p_claim_month::TEXT || '/' || p_claim_year::TEXT,
    'Claim rejection', p_insurance_company_id, p_claim_month, p_claim_year, 'rejection'
  );

  RETURN jsonb_build_object('claim_id', v_claim_id, 'rejected_amount', p_rejected_amount, 'facility_id', p_facility_id);
END;
$$;

REVOKE ALL ON FUNCTION security_internal.submit_claim_rejection_atomic(
  UUID, NUMERIC, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, UUID
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION security_internal.submit_claim_rejection_atomic(
  UUID, NUMERIC, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, UUID
) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_claim_rejection_atomic(
  p_insurance_company_id UUID,
  p_rejected_amount NUMERIC,
  p_claim_month INTEGER,
  p_claim_year INTEGER,
  p_denial_category TEXT DEFAULT NULL,
  p_denial_reason TEXT DEFAULT NULL,
  p_root_cause TEXT DEFAULT NULL,
  p_denial_notes TEXT DEFAULT NULL,
  p_facility_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE SQL
SECURITY INVOKER
SET search_path = ''
AS $wrapper$
  SELECT security_internal.submit_claim_rejection_atomic(
    p_insurance_company_id, p_rejected_amount, p_claim_month, p_claim_year,
    p_denial_category, p_denial_reason, p_root_cause, p_denial_notes, p_facility_id
  );
$wrapper$;

REVOKE ALL ON FUNCTION public.submit_claim_rejection_atomic(
  UUID, NUMERIC, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, UUID
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_claim_rejection_atomic(
  UUID, NUMERIC, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, UUID
) TO authenticated;

COMMENT ON COLUMN public.ledger_entries.facility_id IS
  'Owning facility/tenant for ledger postings; NULL legacy rows remain unassigned and are not visible to ordinary facility members.';
