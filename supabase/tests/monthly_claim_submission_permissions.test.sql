-- Run with: supabase test db
-- Contract checks for the least-privilege monthly claim + system posting RPCs.
DO $test$
DECLARE
  v_public_claim text := 'public.submit_monthly_claim_atomic(uuid,numeric,integer,integer,uuid,text)';
  v_internal_claim text := 'security_internal.submit_monthly_claim_atomic(uuid,numeric,integer,integer,uuid,text)';
  v_public_rejection text := 'public.submit_claim_rejection_atomic(uuid,numeric,integer,integer,text,text,text,text,uuid)';
  v_internal_rejection text := 'security_internal.submit_claim_rejection_atomic(uuid,numeric,integer,integer,text,text,text,text,uuid)';
  v_role text;
  v_view_definition text;
  v_claim_definition text;
  v_rejection_definition text;
  v_submission_definition text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.app_permissions
    WHERE permission_key = 'claims.submit_monthly'
  ) THEN
    RAISE EXCEPTION 'Dedicated monthly claim submission permission is missing';
  END IF;

  FOREACH v_role IN ARRAY ARRAY['superuser','admin','claims_officer','data_entry_officer'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.role_permissions
      WHERE role = v_role::public.app_role AND permission_key = 'claims.submit_monthly'
    ) THEN
      RAISE EXCEPTION 'Monthly claim submission permission is not granted to role %', v_role;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.role_permissions
    WHERE role IN ('claims_officer','data_entry_officer')
      AND permission_key IN ('payments.write','ledger.write')
  ) THEN
    RAISE EXCEPTION 'Claims roles must not receive general payment or ledger write permissions';
  END IF;

  IF has_function_privilege('authenticated', 'security_internal.configured_withholding_tax_rate(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Configured WHT rate helper must not expose the internal system setting directly';
  END IF;

  IF position('No approved provisional WHT rate is configured for this facility' in pg_get_functiondef('security_internal.configured_withholding_tax_rate(uuid)'::regprocedure)) = 0
     OR position('5.00' in pg_get_functiondef('security_internal.configured_withholding_tax_rate(uuid)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'Monthly claim posting must fail closed when the approved WHT rate is not configured; no implicit tax rate is permitted';
  END IF;

  IF has_function_privilege('anon', v_public_claim, 'EXECUTE')
     OR has_function_privilege('anon', v_public_rejection, 'EXECUTE')
     OR has_function_privilege('anon', v_internal_claim, 'EXECUTE')
     OR has_function_privilege('anon', v_internal_rejection, 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous execution of monthly claim posting functions must be revoked';
  END IF;

  IF NOT has_function_privilege('authenticated', v_public_claim, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_public_rejection, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_internal_claim, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_internal_rejection, 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated monthly claim posting execution grants are incomplete';
  END IF;

  IF NOT has_schema_privilege('authenticated', 'security_internal', 'USAGE') THEN
    RAISE EXCEPTION 'Authenticated callers require schema usage for the private helper invoked by the public wrapper';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid IN (v_internal_claim::regprocedure, v_internal_rejection::regprocedure)
      AND (NOT p.prosecdef OR NOT coalesce(array_to_string(p.proconfig, ','), '') LIKE '%search_path=%')
  ) THEN
    RAISE EXCEPTION 'Private posting helpers must be SECURITY DEFINER with a pinned search_path';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid IN (v_public_claim::regprocedure, v_public_rejection::regprocedure)
      AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'Public RPC wrappers must remain SECURITY INVOKER';
  END IF;

  IF position('SECURITY DEFINER' in upper(pg_get_functiondef(v_internal_rejection::regprocedure))) = 0
     OR position('Select an active insurance company.' in pg_get_functiondef(v_internal_rejection::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Rejection posting helper must be privileged, pinned, and validate the active insurer';
  END IF;

  IF position('claims.submit_monthly' in pg_get_functiondef(v_internal_claim::regprocedure)) = 0
     OR position('claims.submit_monthly' in pg_get_functiondef(v_internal_rejection::regprocedure)) = 0
     OR position('claims.write' in pg_get_functiondef(v_internal_claim::regprocedure)) = 0
     OR position('claims.write' in pg_get_functiondef(v_internal_rejection::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Private posting helpers must enforce claims.write and claims.submit_monthly';
  END IF;
  v_submission_definition := pg_get_functiondef(v_internal_claim::regprocedure);

  IF position('pg_advisory_xact_lock' in v_submission_definition) = 0
     OR position('idempotency_key' in v_submission_definition) = 0
     OR position('claims_settlement_periods' in v_submission_definition) = 0
     OR position('monthly_claim_submissions' in v_submission_definition) = 0 THEN
    RAISE EXCEPTION 'Monthly claim RPC must be idempotent and atomically link its settlement period';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.monthly_claim_submissions'::regclass
      AND conname = 'monthly_claim_submission_period_once'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.monthly_claim_submissions'::regclass
      AND conname = 'monthly_claim_submission_idempotency_once'
  ) THEN
    RAISE EXCEPTION 'Monthly claim period and idempotency uniqueness constraints are required';
  END IF;

  IF has_table_privilege('authenticated', 'public.monthly_claim_submissions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.monthly_claim_submissions', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.monthly_claim_submissions', 'DELETE') THEN
    RAISE EXCEPTION 'Authenticated clients must not write directly to the immutable monthly submission ledger';
  END IF;

  IF (
    SELECT column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'claims_settlement_periods'
      AND column_name = 'withholding_tax_rate'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'Settlement WHT rate must not have an implicit default';
  END IF;

  v_claim_definition := pg_get_functiondef(v_internal_claim::regprocedure);
  v_rejection_definition := pg_get_functiondef(v_internal_rejection::regprocedure);

  IF position('user_has_facility_access' in v_claim_definition) = 0
     OR position('p_facility_id' in v_claim_definition) = 0
     OR position('withholding_tax_rate' in v_claim_definition) = 0
     OR position('facility_id' in v_claim_definition) = 0 THEN
    RAISE EXCEPTION 'Monthly claim posting must validate facility membership, use the facility-approved WHT rate and persist facility scope';
  END IF;

  IF position('user_has_facility_access' in v_rejection_definition) = 0
     OR position('p_facility_id' in v_rejection_definition) = 0
     OR position('facility_id' in v_rejection_definition) = 0 THEN
    RAISE EXCEPTION 'Claim rejection posting must validate facility membership and persist facility scope';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ledger_entries' AND column_name = 'facility_id'
  ) THEN
    RAISE EXCEPTION 'Ledger entries must carry facility ownership';
  END IF;

  v_view_definition := lower(pg_get_viewdef('public.claims_outstanding_periods'::regclass));

  IF position('status' in v_view_definition) = 0
     OR position('rejected' in v_view_definition) = 0
     OR position('is_actual = false' in v_view_definition) = 0
     OR position('is_actual = true' in v_view_definition) = 0 THEN
    RAISE EXCEPTION 'The outstanding-period view must distinguish rejected claim events and provisional versus actual WHT';
  END IF;

  IF position('greatest' in v_view_definition) = 0
     OR position('actual_withholding_tax_entry_count' in v_view_definition) = 0 THEN
    RAISE EXCEPTION 'The outstanding-period view must use only actual WHT once payment advice is recorded';
  END IF;

  IF position('INSERT INTO public.withholding_tax' in v_rejection_definition) > 0
     OR position('configured_withholding_tax_rate' in v_rejection_definition) > 0 THEN
    RAISE EXCEPTION 'Recording a rejection must not create or reverse provisional WHT; actual WHT is captured from payment advice';
  END IF;

  IF GREATEST(1000::numeric - 100::numeric, 0::numeric) <> 900 THEN
    RAISE EXCEPTION 'A GHC 100 rejection against GHC 1000 submitted must leave GHC 900 approved';
  END IF;

  IF GREATEST(1000::numeric - 100::numeric - 67.5::numeric, 0::numeric) <> 832.5 THEN
    RAISE EXCEPTION 'Approved gross amount less actual WHT must reconcile using actual tax only';
  END IF;

  IF NOT (
    SELECT COALESCE(reloptions, ARRAY[]::text[]) @> ARRAY['security_invoker=true']::text[]
    FROM pg_class
    WHERE oid = 'public.claims_outstanding_periods'::regclass
  ) THEN
    RAISE EXCEPTION 'The outstanding-period view must retain SECURITY INVOKER semantics';
  END IF;
END;
$test$;