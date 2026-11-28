-- Contract test for the least-privilege company letterhead reader.
DO $test$
DECLARE
  v_public_signature text := 'public.get_report_letterhead_settings()';
  v_private_signature text := 'security_internal.get_report_letterhead_settings()';
  v_public_definition text;
  v_private_definition text;
  v_public_is_definer boolean;
  v_private_is_definer boolean;
  v_private_config text;
BEGIN
  IF NOT has_function_privilege('authenticated', v_public_signature, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_private_signature, 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated report users must be able to call the letterhead reader';
  END IF;
  IF has_function_privilege('anon', v_public_signature, 'EXECUTE')
     OR has_function_privilege('anon', v_private_signature, 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous execution of letterhead readers must be revoked';
  END IF;

  SELECT pg_get_functiondef(v_public_signature::regprocedure),
         prosecdef
  INTO v_public_definition, v_public_is_definer
  FROM pg_proc WHERE oid = v_public_signature::regprocedure;
  SELECT pg_get_functiondef(v_private_signature::regprocedure),
         prosecdef,
         coalesce(array_to_string(proconfig, ','), '')
  INTO v_private_definition, v_private_is_definer, v_private_config
  FROM pg_proc WHERE oid = v_private_signature::regprocedure;

  IF v_public_is_definer THEN
    RAISE EXCEPTION 'The exposed letterhead RPC must remain SECURITY INVOKER';
  END IF;
  IF NOT v_private_is_definer OR position('search_path=' in v_private_config) = 0 THEN
    RAISE EXCEPTION 'The private letterhead helper must be SECURITY DEFINER with a pinned search_path';
  END IF;
  IF position('security_internal.get_report_letterhead_settings' in v_public_definition) = 0 THEN
    RAISE EXCEPTION 'The public wrapper must delegate to the private helper';
  END IF;
  IF position('reports.read' in v_private_definition) = 0
     OR position('ledger.read' in v_private_definition) = 0
     OR position('claims.read' in v_private_definition) = 0
     OR position('preauth.read' in v_private_definition) = 0 THEN
    RAISE EXCEPTION 'The private letterhead reader must require an approved document/report permission';
  END IF;
  IF position('provider_name' in v_private_definition) = 0
     OR position('letterhead_footer_note' in v_private_definition) = 0
     OR position('banking_partners' in v_private_definition) > 0
     OR position('private_api_key' in v_private_definition) > 0 THEN
    RAISE EXCEPTION 'Letterhead reader must return only the approved public branding fields';
  END IF;
END;
$test$;
