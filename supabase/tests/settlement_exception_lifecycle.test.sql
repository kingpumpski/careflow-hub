-- Run with: supabase test db
-- Read-only contract checks for the online settlement exception register.
-- This verifies schema/security wiring; it does not replace multi-user RLS integration tests.
DO $test$
DECLARE
  v_record_signature text :=
    'public.record_settlement_exception(uuid,text,text,text,text,timestamp with time zone)';
  v_transition_signature text :=
    'public.transition_settlement_exception_atomic(uuid,text,text)';
BEGIN
  IF to_regclass('public.settlement_exceptions') IS NULL
     OR to_regclass('public.settlement_exception_audit_events') IS NULL THEN
    RAISE EXCEPTION 'Settlement exception register tables are missing';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.settlement_exceptions'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.settlement_exception_audit_events'::regclass) THEN
    RAISE EXCEPTION 'RLS must be enabled on both settlement exception tables';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.settlement_exceptions', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.settlement_exception_audit_events', 'SELECT') THEN
    RAISE EXCEPTION 'Authenticated users must be able to read permitted settlement exception rows';
  END IF;

  IF has_table_privilege('authenticated', 'public.settlement_exceptions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.settlement_exceptions', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.settlement_exceptions', 'DELETE')
     OR has_table_privilege('authenticated', 'public.settlement_exception_audit_events', 'INSERT')
     OR has_table_privilege('authenticated', 'public.settlement_exception_audit_events', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.settlement_exception_audit_events', 'DELETE')
     OR has_table_privilege('authenticated', 'public.settlement_exception_audit_events', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Authenticated direct writes must be revoked; lifecycle writes use audited RPCs';
  END IF;

  IF has_function_privilege('anon', v_record_signature, 'EXECUTE')
     OR has_function_privilege('anon', v_transition_signature, 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous execution of settlement exception RPCs must be revoked';
  END IF;
  IF NOT has_function_privilege('authenticated', v_record_signature, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_transition_signature, 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated execution of settlement exception RPCs must be granted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid IN (v_record_signature::regprocedure, v_transition_signature::regprocedure)
      AND (
        NOT p.prosecdef
        OR NOT coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']::text[]
      )
  ) THEN
    RAISE EXCEPTION 'Settlement exception RPCs must be SECURITY DEFINER with an empty pinned search_path';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'settlement_exceptions'
      AND policyname = 'Settlement exceptions facility access'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'settlement_exception_audit_events'
      AND policyname = 'Settlement exception audit facility access'
  ) THEN
    RAISE EXCEPTION 'Facility-scoped SELECT policies are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.settlement_exception_audit_events'::regclass
      AND tgname = 'trg_settlement_exception_audit_immutable'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Immutable settlement exception audit trigger is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'uq_settlement_exception_active_type'
  ) THEN
    RAISE EXCEPTION 'Active exception uniqueness guard is missing';
  END IF;
END;
$test$;
