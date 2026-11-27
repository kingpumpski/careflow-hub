-- Contract checks for superuser-only facility provisional WHT configuration.
DO $test$
DECLARE
  v_internal regprocedure := 'security_internal.set_facility_provisional_wht_rate(uuid,numeric)'::regprocedure;
  v_public regprocedure := 'public.set_facility_provisional_wht_rate(uuid,numeric)'::regprocedure;
  v_definition text;
BEGIN
  IF has_function_privilege('anon', v_internal, 'EXECUTE')
     OR has_function_privilege('authenticated', v_internal, 'EXECUTE')
     OR has_function_privilege('anon', v_public, 'EXECUTE') THEN
    RAISE EXCEPTION 'Only the guarded public WHT wrapper may be executable by authenticated users';
  END IF;

  IF NOT has_function_privilege('authenticated', v_public, 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated clients must be able to invoke the guarded WHT wrapper';
  END IF;

  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_internal)
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_public) THEN
    RAISE EXCEPTION 'The private helper and superuser-checking public wrapper must both be SECURITY DEFINER';
  END IF;

  v_definition := pg_get_functiondef(v_public);
  IF position('superuser' in v_definition) = 0
     OR position('Only a superuser' in v_definition) = 0
     OR position('security_internal.set_facility_provisional_wht_rate' in v_definition) = 0 THEN
    RAISE EXCEPTION 'The public WHT wrapper must enforce the superuser boundary before calling the private helper';
  END IF;

  v_definition := pg_get_functiondef(v_internal);
  IF position('settings.manage' in v_definition) = 0
     OR position('jsonb_set' in v_definition) = 0
     OR position('audit_logs' in v_definition) = 0
     OR position('p_rate < 0' in v_definition) = 0
     OR position('p_rate > 100' in v_definition) = 0 THEN
    RAISE EXCEPTION 'The private WHT helper must validate rate, update settings and audit the change';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'facilities' AND column_name = 'settings'
  ) THEN
    RAISE EXCEPTION 'Facility settings JSON is required for the approved provisional WHT rate';
  END IF;
END;
$test$;
