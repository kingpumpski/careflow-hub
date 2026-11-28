DO $test$
DECLARE
  v_get regprocedure := 'public.get_facility_letterhead_settings(uuid)'::regprocedure;
  v_save regprocedure := 'public.save_facility_letterhead_settings(uuid,jsonb)'::regprocedure;
  v_get_def TEXT;
  v_save_def TEXT;
BEGIN
  IF NOT has_function_privilege('authenticated', v_get, 'EXECUTE')
     OR has_function_privilege('anon', v_get, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_save, 'EXECUTE')
     OR has_function_privilege('anon', v_save, 'EXECUTE') THEN
    RAISE EXCEPTION 'Facility letterhead RPC grants are not restricted to authenticated users';
  END IF;

  SELECT pg_get_functiondef(v_get) INTO v_get_def;
  SELECT pg_get_functiondef(v_save) INTO v_save_def;
  IF position('user_has_facility_access' IN v_get_def) = 0
     OR position('user_has_facility_access' IN v_save_def) = 0
     OR position('settings.manage' IN v_save_def) = 0
     OR position('system_settings' IN v_get_def) = 0
     OR position('provider_name' IN v_save_def) = 0
     OR position('banking_partners' IN v_save_def) = 0 THEN
    RAISE EXCEPTION 'Facility letterhead RPCs are missing facility scope, global fallback or allowlist validation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'facility-logos' AND public = true) THEN
    RAISE EXCEPTION 'Facility logo bucket is not configured as a public-read bucket';
  END IF;
END;
$test$;
