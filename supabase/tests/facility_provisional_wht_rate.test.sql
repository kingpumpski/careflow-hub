-- Contract checks for facility-approved provisional WHT configuration.
DO $test$
DECLARE
  v_internal regprocedure := 'security_internal.set_facility_provisional_wht_rate(uuid,numeric)'::regprocedure;
  v_public regprocedure := 'public.set_facility_provisional_wht_rate(uuid,numeric)'::regprocedure;
  v_definition text;
BEGIN
  IF has_function_privilege('anon', v_internal, 'EXECUTE')
     OR has_function_privilege('anon', v_public, 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous callers must not configure facility WHT rates';
  END IF;

  IF NOT has_function_privilege('authenticated', v_public, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_internal, 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated administrator RPC grants are incomplete';
  END IF;

  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_internal)
     OR (SELECT prosecdef FROM pg_proc WHERE oid = v_public) THEN
    RAISE EXCEPTION 'Private WHT configuration must be SECURITY DEFINER behind an invoker wrapper';
  END IF;

  IF NOT coalesce(array_to_string((SELECT proconfig FROM pg_proc WHERE oid = v_internal), ','), '') LIKE '%search_path=%' THEN
    RAISE EXCEPTION 'Facility WHT configuration must pin search_path';
  END IF;

  v_definition := pg_get_functiondef(v_internal);
  IF position('settings.manage' in v_definition) = 0
     OR position('superuser' in v_definition) = 0
     OR position('admin' in v_definition) = 0
     OR position('jsonb_set' in v_definition) = 0
     OR position('audit_logs' in v_definition) = 0 THEN
    RAISE EXCEPTION 'Facility WHT configuration must enforce administrator permissions, update facility settings and audit the change';
  END IF;

  IF position('p_rate < 0' in v_definition) = 0
     OR position('p_rate > 100' in v_definition) = 0 THEN
    RAISE EXCEPTION 'Facility WHT configuration must reject rates outside 0-100 percent';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'facilities' AND column_name = 'settings'
  ) THEN
    RAISE EXCEPTION 'Facility settings JSON is required for the approved provisional WHT rate';
  END IF;
END;
$test$;
