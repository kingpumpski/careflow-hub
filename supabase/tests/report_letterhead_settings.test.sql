-- Contract test for the least-privilege company letterhead reader.
DO $test$
DECLARE
  v_signature text := 'public.get_report_letterhead_settings()';
  v_definition text;
BEGIN
  IF NOT has_function_privilege('authenticated', v_signature, 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated report users must be able to read approved letterhead settings';
  END IF;
  IF has_function_privilege('anon', v_signature, 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous execution of the letterhead settings RPC must be revoked';
  END IF;

  SELECT pg_get_functiondef(v_signature::regprocedure) INTO v_definition;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_signature::regprocedure)
     OR NOT coalesce(array_to_string((SELECT proconfig FROM pg_proc WHERE oid = v_signature::regprocedure), ','), '') LIKE '%search_path=%' THEN
    RAISE EXCEPTION 'Letterhead reader must be SECURITY DEFINER with a pinned search_path';
  END IF;
  IF position('reports.read' in v_definition) = 0 THEN
    RAISE EXCEPTION 'Letterhead reader must require reports.read';
  END IF;
  IF position('provider_name' in v_definition) = 0
     OR position('letterhead_footer_note' in v_definition) = 0
     OR position('banking_partners' in v_definition) > 0
     OR position('private_api_key' in v_definition) > 0 THEN
    RAISE EXCEPTION 'Letterhead reader must return only the approved public branding fields';
  END IF;
END;
$test$;
