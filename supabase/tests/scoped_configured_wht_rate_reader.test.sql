DO $test$
DECLARE
  v_rpc regprocedure := 'public.get_configured_withholding_tax_rate(uuid)'::regprocedure;
  v_internal regprocedure := 'security_internal.configured_withholding_tax_rate(uuid)'::regprocedure;
  v_definition TEXT;
BEGIN
  IF NOT has_function_privilege('authenticated', v_rpc, 'EXECUTE')
     OR has_function_privilege('anon', v_rpc, 'EXECUTE') THEN
    RAISE EXCEPTION 'Only authenticated users may read their facility-approved WHT rate';
  END IF;
  IF has_function_privilege('authenticated', v_internal, 'EXECUTE') THEN
    RAISE EXCEPTION 'The private WHT configuration helper must not be directly executable by clients';
  END IF;
  SELECT pg_get_functiondef(v_internal) INTO v_definition;
  IF position('system_settings' IN v_definition) = 0
     OR position('facilities' IN v_definition) = 0
     OR position('user_has_facility_access' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'WHT rate helper must prefer facility settings and use the scoped global settings fallback';
  END IF;
END;
$test$;
