-- Run with: supabase test db
-- Contract checks for the least-privilege monthly claim + system posting RPCs.
DO $test$
DECLARE
  v_public_claim text := 'public.submit_monthly_claim_atomic(uuid,numeric,integer,integer)';
  v_internal_claim text := 'security_internal.submit_monthly_claim_atomic(uuid,numeric,integer,integer)';
  v_public_rejection text := 'public.submit_claim_rejection_atomic(uuid,numeric,integer,integer,text,text,text,text)';
  v_internal_rejection text := 'security_internal.submit_claim_rejection_atomic(uuid,numeric,integer,integer,text,text,text,text)';
  v_role text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.app_permissions
    WHERE key = 'claims.submit_monthly'
  ) THEN
    RAISE EXCEPTION 'Dedicated monthly claim submission permission is missing';
  END IF;

  FOREACH v_role IN ARRAY ARRAY['superuser','admin','claims_officer','data_entry_officer'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.role_permissions
      WHERE role = v_role AND permission_key = 'claims.submit_monthly' AND granted = true
    ) THEN
      RAISE EXCEPTION 'Monthly claim submission permission is not granted to role %', v_role;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.role_permissions
    WHERE role IN ('claims_officer','data_entry_officer')
      AND permission_key IN ('payments.write','ledger.write')
      AND granted = true
  ) THEN
    RAISE EXCEPTION 'Claims roles must not receive general payment or ledger write permissions';
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

  IF position('claims.submit_monthly' in pg_get_functiondef(v_internal_claim::regprocedure)) = 0
     OR position('claims.submit_monthly' in pg_get_functiondef(v_internal_rejection::regprocedure)) = 0
     OR position('claims.write' in pg_get_functiondef(v_internal_claim::regprocedure)) = 0
     OR position('claims.write' in pg_get_functiondef(v_internal_rejection::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Private posting helpers must enforce claims.write and claims.submit_monthly';
  END IF;
END;
$test$;
