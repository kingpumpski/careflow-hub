-- Run with: supabase test db
-- The document-preparation handoff must use preauthorization_submissions only.
-- The similarly named preauth_submissions table is a retired insurer execution queue.
DO $test$
DECLARE
  v_definition text;
  v_status_constraint text;
BEGIN
  IF to_regclass('public.preauthorization_submissions') IS NULL THEN
    RAISE EXCEPTION 'Prepared-handoff relation public.preauthorization_submissions is missing';
  END IF;

  IF to_regclass('public.preauth_submissions') IS NULL THEN
    RAISE EXCEPTION 'Expected legacy queue relation is missing; this test must distinguish it from the prepared-handoff relation';
  END IF;

  IF to_regclass('public.pre_auth_submissions') IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected misspelled relation public.pre_auth_submissions exists';
  END IF;

  SELECT pg_get_functiondef(
    'security_internal.finalize_preauthorization_handoff(uuid,jsonb,numeric,jsonb,jsonb,text,text,text)'::regprocedure
  ) INTO v_definition;

  IF position('public.preauthorization_submissions' in v_definition)=0 THEN
    RAISE EXCEPTION 'Finalizer must write to public.preauthorization_submissions';
  END IF;
  IF position('public.preauth_submissions' in v_definition)>0
     OR position('public.pre_auth_submissions' in v_definition)>0 THEN
    RAISE EXCEPTION 'Finalizer must not use either legacy or misspelled submission relation';
  END IF;
  IF position('queued' in lower(v_definition))>0
     OR position('delivered' in lower(v_definition))>0
     OR position('external_reference' in lower(v_definition))>0 THEN
    RAISE EXCEPTION 'Finalizer must not expose insurer queue or delivery semantics';
  END IF;
  IF position('''prepared''' in v_definition)=0 THEN
    RAISE EXCEPTION 'Finalizer must create prepared-only handoff records';
  END IF;

  SELECT pg_get_constraintdef(c.oid)
    INTO v_status_constraint
  FROM pg_constraint c
  WHERE c.conrelid='public.preauthorization_submissions'::regclass
    AND c.conname='preauthorization_submissions_status_check';

  IF coalesce(v_status_constraint,'') NOT LIKE '%prepared%' THEN
    RAISE EXCEPTION 'Prepared-handoff status constraint is missing';
  END IF;
END;
$test$;

DO $wrapper_security$
DECLARE
  v_function oid;
  v_is_definer boolean;
  v_config text[];
BEGIN
  v_function := 'public.finalize_preauthorization_handoff(uuid,jsonb,numeric,jsonb,jsonb,text,text,text)'::regprocedure;
  SELECT prosecdef, proconfig INTO v_is_definer, v_config
  FROM pg_proc WHERE oid=v_function;

  IF v_is_definer THEN
    RAISE EXCEPTION 'Public Pre-Authorization finalizer wrapper must be SECURITY INVOKER';
  END IF;
  IF NOT coalesce(v_config,ARRAY[]::text[]) @> ARRAY['search_path=""']::text[] THEN
    RAISE EXCEPTION 'Public Pre-Authorization finalizer wrapper must pin an empty search_path';
  END IF;
  IF NOT has_function_privilege('authenticated',v_function,'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role must retain finalizer wrapper execute';
  END IF;
  IF has_function_privilege('anon',v_function,'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role must not execute finalizer wrapper';
  END IF;
END;
$wrapper_security$;

DO $private_acl$
DECLARE
  v_function oid;
BEGIN
  v_function := 'security_internal.finalize_preauthorization_handoff(uuid,jsonb,numeric,jsonb,jsonb,text,text,text)'::regprocedure;
  IF has_function_privilege('anon',v_function,'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role must not execute private Pre-Authorization finalizer';
  END IF;
  IF NOT has_function_privilege('authenticated',v_function,'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role must retain private finalizer execution for the invoker wrapper';
  END IF;
END;
$private_acl$;
