-- Run with: supabase test db
-- Read-only assertions for the facility onboarding security boundary.
DO $test$
DECLARE
  v_create_signature text := 'public.create_facility_with_owner(text,text,text,text,text,text)';
  v_add_signature text := 'public.add_facility_member_by_email(uuid,text,text)';
  v_suspend_signature text := 'public.deactivate_facility_member(uuid,text)';
  v_create_helper text := 'security_internal.create_facility_with_owner(text,text,text,text,text,text)';
  v_add_helper text := 'security_internal.add_facility_member_by_email(uuid,text,text)';
  v_suspend_helper text := 'security_internal.deactivate_facility_member(uuid,text)';
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

  IF has_function_privilege('anon', v_create_helper, 'EXECUTE')
     OR has_function_privilege('anon', v_add_helper, 'EXECUTE')
     OR has_function_privilege('anon', v_suspend_helper, 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous execution of private facility helpers must remain revoked';
  END IF;
  IF has_function_privilege('authenticated', v_create_helper, 'EXECUTE')
     OR has_function_privilege('authenticated', v_add_helper, 'EXECUTE')
     OR has_function_privilege('authenticated', v_suspend_helper, 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated callers must not bypass the superuser-only public wrappers';
  END IF;
  IF has_function_privilege('authenticated', 'security_internal.is_active_facility_member(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'The private facility membership probe must not be directly executable by authenticated users';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('user_roles', 'user_permission_overrides')
      AND (
        coalesce(qual, '') LIKE '%public.has_role(%'
        OR coalesce(with_check, '') LIKE '%public.has_role(%'
      )
  ) THEN
    RAISE EXCEPTION 'RLS policies must use private role helpers, not the revoked public has_role RPC';
  END IF;
  IF NOT has_schema_privilege('authenticated', 'security_internal', 'USAGE') THEN
    RAISE EXCEPTION 'Authenticated callers require schema usage for the private facility helpers';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid IN (v_create_helper::regprocedure, v_add_helper::regprocedure, v_suspend_helper::regprocedure)
      AND (NOT p.prosecdef OR NOT coalesce(array_to_string(p.proconfig, ','), '') LIKE '%search_path=%')
  ) THEN
    RAISE EXCEPTION 'Private facility helpers must be SECURITY DEFINER with a pinned search_path';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid IN (v_create_signature::regprocedure, v_add_signature::regprocedure, v_suspend_signature::regprocedure)
      AND (NOT p.prosecdef OR NOT coalesce(array_to_string(p.proconfig, ','), '') LIKE '%search_path=%')
  ) THEN
    RAISE EXCEPTION 'Public facility wrappers must be SECURITY DEFINER with a pinned search_path';
  END IF;
  IF position('Only a superuser can administer facilities' in pg_get_functiondef(v_create_signature::regprocedure)) = 0
     OR position('Only a superuser can administer facility access' in pg_get_functiondef(v_add_signature::regprocedure)) = 0
     OR position('Only a superuser can administer facility access' in pg_get_functiondef(v_suspend_signature::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Every public facility administration wrapper must enforce the superuser role';
  END IF;

  IF position('A facility must retain at least one active owner' in pg_get_functiondef(v_add_helper::regprocedure)) = 0
     OR position('A facility must retain at least one active owner' in pg_get_functiondef(v_suspend_helper::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Facility membership operations must prevent removal or demotion of the last active owner';
  END IF;

  IF position('FOR UPDATE' in pg_get_functiondef(v_add_helper::regprocedure)) = 0
     OR position('FOR UPDATE' in pg_get_functiondef(v_suspend_helper::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Facility membership mutations must serialize per-facility owner checks';
  END IF;
END;
$test$;
