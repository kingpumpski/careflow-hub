-- Run with: supabase test db
-- Guards the canonical preauth_submissions table name in the finalization RPC.
DO $test$
DECLARE
  v_definition text;
BEGIN
  IF to_regclass('public.preauth_submissions') IS NULL THEN
    RAISE EXCEPTION 'Canonical public.preauth_submissions table is missing';
  END IF;

  IF to_regclass('public.pre_auth_submissions') IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected legacy public.pre_auth_submissions relation exists; do not mask naming errors';
  END IF;

  v_definition := pg_get_functiondef(
    'security_internal.finalize_preauthorization_handoff(uuid,jsonb,numeric,jsonb,jsonb,text,text,text)'::regprocedure
  );

  IF position('public.preauth_submissions' in v_definition) = 0
     OR position('pre_auth_submissions' in v_definition) > 0 THEN
    RAISE EXCEPTION 'Finalization RPC must read and write the canonical public.preauth_submissions table';
  END IF;

  IF position('v_submission public.preauth_submissions' in v_definition) = 0 THEN
    RAISE EXCEPTION 'Finalization RPC must use the canonical preauth_submissions row type';
  END IF;
END;
$test$;
