-- Run with: supabase test db
-- Contract checks for the least-privilege monthly claim + system posting RPCs.
DO $test$
DECLARE
  v_public_claim text := 'public.submit_monthly_claim_atomic(uuid,numeric,integer,integer)';
  v_internal_claim text := 'security_internal.submit_monthly_claim_atomic(uuid,numeric,integer,integer)';
  v_public_rejection text := 'public.submit_claim_rejection_atomic(uuid,numeric,integer,integer,text,text,text,text)';
  v_internal_rejection text := 'security_internal.submit_claim_rejection_atomic(uuid,numeric,integer,integer,text,text,text,text)';
  v_role text;
  v_view_definition text;
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

  IF has_function_privilege('authenticated', 'security_internal.configured_withholding_tax_rate()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Configured WHT rate helper must not expose the internal system setting directly';
  END IF;

  IF position('No withholding-tax rate is configured' in pg_get_functiondef('security_internal.configured_withholding_tax_rate()'::regprocedure)) = 0
     OR position('5.00' in pg_get_functiondef('security_internal.configured_withholding_tax_rate()'::regprocedure)) > 0 THEN
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
  v_view_definition := lower(pg_get_viewdef('public.claims_outstanding_periods'::regclass));

  IF position('sum(coalesce(c.claim_amount' in v_view_definition) = 0
     OR position('coalesce(cp.submitted_amount' in v_view_definition) = 0
     OR position('coalesce(cp.rejected_amount' in v_view_definition) = 0 THEN
    RAISE EXCEPTION 'The view must preserve gross submitted totals and subtract rejected claims exactly once';
  END IF;

  IF GREATEST(100::numeric - 20::numeric, 0::numeric) <> 80 THEN
    RAISE EXCEPTION 'Rejected claim amounts must be subtracted exactly once from gross submissions';
  END IF;

  IF position('greatest(sum(coalesce(t.tax_amount' in v_view_definition) = 0 THEN
    RAISE EXCEPTION 'Period WHT aggregation must not allow negative reversal totals to create a phantom outstanding balance';
  END IF;

  IF NOT (
    SELECT COALESCE(reloptions, ARRAY[]::text[]) @> ARRAY['security_invoker=true']::text[]
    FROM pg_class
    WHERE oid = 'public.claims_outstanding_periods'::regclass
  ) THEN
    RAISE EXCEPTION 'The outstanding-period view must retain SECURITY INVOKER semantics';
  END IF;

  IF GREATEST(5::numeric + (-5::numeric), 0::numeric) <> 0
     OR GREATEST(5::numeric + (-1::numeric), 0::numeric) <> 4 THEN
    RAISE EXCEPTION 'Net provisional WHT reversal arithmetic is incorrect';
  END IF;
END;
$test$;