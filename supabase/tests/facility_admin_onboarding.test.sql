-- Run with: supabase test db
-- Read-only assertions for the facility onboarding security boundary.
DO $test$
DECLARE
  v_create_signature text := 'public.create_facility_with_owner(text,text,text,text,text,text)';
  v_add_signature text := 'public.add_facility_member_by_email(uuid,text,text)';
  v_suspend_signature text := 'public.deactivate_facility_member(uuid,text)';
BEGIN
  IF has_table_privilege('authenticated', 'public.facilities', 'INSERT')
     OR has_table_privilege('authenticated', 'public.facilities', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.facility_memberships', 'INSERT')
     OR has_table_privilege('authenticated', 'public.facility_memberships', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.facility_memberships', 'DELETE') THEN
    RAISE EXCEPTION 'Authenticated users must not write facility tables directly';
  END IF;

  IF has_function_privilege('anon', v_create_signature, 'EXECUTE')
     OR has_function_privilege('anon', v_add_signature, 'EXECUTE')
     OR has_function_privilege('anon', v_suspend_signature, 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous execution of facility administration RPCs must be revoked';
  END IF;
  IF NOT has_function_privilege('authenticated', v_create_signature, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_add_signature, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_suspend_signature, 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated facility administration RPC execution is not granted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid IN (v_create_signature::regprocedure, v_add_signature::regprocedure, v_suspend_signature::regprocedure)
      AND (NOT p.prosecdef OR NOT coalesce(array_to_string(p.proconfig, ','), '') LIKE '%search_path=%')
  ) THEN
    RAISE EXCEPTION 'Facility administration RPCs must be SECURITY DEFINER with a pinned search_path';
  END IF;
END;
$test$;
