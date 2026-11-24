-- Run with: supabase test db
-- Verify legacy SECURITY DEFINER functions are pinned without changing trigger bindings.
DO $test$
DECLARE
  v_audit regprocedure := 'public.audit_trigger_fn()'::regprocedure;
  v_user regprocedure := 'public.handle_new_user()'::regprocedure;
  v_role regprocedure := 'public.has_role(uuid,public.app_role)'::regprocedure;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid IN (v_audit, v_user, v_role)
      AND (
        NOT p.prosecdef
        OR NOT COALESCE(array_to_string(p.proconfig, ','), '') LIKE '%search_path=""%'
      )
  ) THEN
    RAISE EXCEPTION 'Legacy SECURITY DEFINER functions must retain SECURITY DEFINER and use an empty search_path';
  END IF;

  IF has_function_privilege('anon', v_audit, 'EXECUTE')
     OR has_function_privilege('authenticated', v_audit, 'EXECUTE')
     OR has_function_privilege('anon', v_user, 'EXECUTE')
     OR has_function_privilege('authenticated', v_user, 'EXECUTE')
     OR has_function_privilege('anon', v_role, 'EXECUTE')
     OR has_function_privilege('authenticated', v_role, 'EXECUTE') THEN
    RAISE EXCEPTION 'Hardening must not broaden direct EXECUTE privileges';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'auth.users'::regclass
      AND tgname = 'on_auth_user_created'
      AND tgfoid = v_user
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'The auth user-creation trigger binding must be preserved';
  END IF;

  IF (
    SELECT count(*) FROM pg_trigger
    WHERE tgfoid = v_audit AND NOT tgisinternal
  ) < 5 THEN
    RAISE EXCEPTION 'Audit triggers must remain bound to the hardened audit function';
  END IF;
END;
$test$;
