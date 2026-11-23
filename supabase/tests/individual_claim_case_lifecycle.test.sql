-- Run with: supabase test db
-- This test is read-only and verifies the installed claim-case schema contract.
DO $test$
DECLARE
  v_create_signature text := 'public.create_individual_claim_case(uuid,uuid,text,date,numeric,text,text,text,text,uuid,date,date,text)';
  v_transition_signature text := 'public.transition_individual_claim_case(uuid,text,text,numeric,numeric,text)';
BEGIN
  IF to_regclass('public.claim_cases') IS NULL OR to_regclass('public.claim_case_events') IS NULL THEN
    RAISE EXCEPTION 'Individual claim case tables are missing';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.claim_cases'::regclass) THEN
    RAISE EXCEPTION 'RLS is not enabled on claim_cases';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.claim_case_events'::regclass) THEN
    RAISE EXCEPTION 'RLS is not enabled on claim_case_events';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.claim_cases', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.claim_case_events', 'SELECT') THEN
    RAISE EXCEPTION 'Authenticated read access is not granted';
  END IF;
  IF has_table_privilege('authenticated', 'public.claim_cases', 'INSERT')
     OR has_table_privilege('authenticated', 'public.claim_cases', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.claim_cases', 'DELETE')
     OR has_table_privilege('authenticated', 'public.claim_case_events', 'INSERT')
     OR has_table_privilege('authenticated', 'public.claim_case_events', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.claim_case_events', 'DELETE') THEN
    RAISE EXCEPTION 'Direct authenticated writes must remain revoked';
  END IF;

  IF has_function_privilege('anon', v_create_signature, 'EXECUTE')
     OR has_function_privilege('anon', v_transition_signature, 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous execution of claim-case RPCs must remain revoked';
  END IF;
  IF NOT has_function_privilege('authenticated', v_create_signature, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_transition_signature, 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated claim-case RPC execution is not granted';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'claim_cases'
      AND policyname = 'claim_cases_select_facility_permission'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'claim_case_events'
      AND policyname = 'claim_case_events_select_facility_permission'
  ) THEN
    RAISE EXCEPTION 'Facility-scoped read policies are missing';
  END IF;

  IF has_function_privilege('anon', 'security_internal.create_individual_claim_case(uuid,uuid,text,date,numeric,text,text,text,text,uuid,date,date,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'security_internal.transition_individual_claim_case(uuid,text,text,numeric,numeric,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous execution of private claim-case helpers must remain revoked';
  END IF;

  IF NOT has_function_privilege('authenticated', 'security_internal.create_individual_claim_case(uuid,uuid,text,date,numeric,text,text,text,text,uuid,date,date,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'security_internal.transition_individual_claim_case(uuid,text,text,numeric,numeric,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated execution of private claim-case helpers is not granted';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid IN (
      'security_internal.create_individual_claim_case(uuid,uuid,text,date,numeric,text,text,text,text,uuid,date,date,text)'::regprocedure,
      'security_internal.transition_individual_claim_case(uuid,text,text,numeric,numeric,text)'::regprocedure
    )
    AND (NOT p.prosecdef OR NOT coalesce(array_to_string(p.proconfig, ','), '') LIKE '%search_path=%')
  ) THEN
    RAISE EXCEPTION 'Private claim-case helpers must be SECURITY DEFINER with a pinned search_path';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid IN (
      'public.create_individual_claim_case(uuid,uuid,text,date,numeric,text,text,text,text,uuid,date,date,text)'::regprocedure,
      'public.transition_individual_claim_case(uuid,text,text,numeric,numeric,text)'::regprocedure
    )
    AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'Exposed claim-case RPC wrappers must remain SECURITY INVOKER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.claim_case_events'::regclass
      AND tgname = 'claim_case_events_immutable'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Immutable claim-case event trigger is missing';
  END IF;

  IF position('v_currency !~ ''^[A-Z]{3}$''' IN pg_get_functiondef(
    'security_internal.create_individual_claim_case(uuid,uuid,text,date,numeric,text,text,text,text,uuid,date,date,text)'::regprocedure
  )) = 0 THEN
    RAISE EXCEPTION 'Claim-case RPC must validate currency as three uppercase ISO letters';
  END IF;

  IF NOT security_internal.claim_case_transition_allowed('draft', 'verified')
     OR NOT security_internal.claim_case_transition_allowed('paid', 'closed')
     OR security_internal.claim_case_transition_allowed('draft', 'paid')
     OR security_internal.claim_case_transition_allowed('closed', 'draft') THEN
    RAISE EXCEPTION 'Claim lifecycle transition matrix failed its contract checks';
  END IF;
END;
$test$;
