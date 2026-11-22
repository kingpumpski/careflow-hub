-- Run with: supabase test db
-- Verifies the live request-number trigger is SECURITY DEFINER with an empty search_path.
DO $test$
DECLARE
  v_function regprocedure := 'security_internal.set_preauth_request_number()'::regprocedure;
  v_config text;
BEGIN
  SELECT COALESCE(array_to_string(p.proconfig, ','), '')
    INTO v_config
  FROM pg_proc p
  WHERE p.oid = v_function;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = v_function
      AND p.prosecdef
      AND COALESCE(array_to_string(p.proconfig, ','), '') LIKE '%search_path=""%'
  ) THEN
    RAISE EXCEPTION 'Pre-authorization request-number trigger must be SECURITY DEFINER with an empty search_path (config: %)', v_config;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.pre_authorizations'::regclass
      AND t.tgfoid = v_function
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Pre-authorization request-number trigger is not bound to the hardened helper';
  END IF;
END;
$test$;
