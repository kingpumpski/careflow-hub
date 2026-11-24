-- Verify the permission RPC follows the actual catalogue schema and grants only enabled role permissions.
DO $test$
DECLARE
  v_definition TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_permissions' AND column_name = 'key'
  ) OR EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_permissions' AND column_name = 'permission_key'
  ) THEN
    RAISE EXCEPTION 'Permission catalogue schema contract changed unexpectedly';
  END IF;

  v_definition := pg_get_functiondef('public.get_my_permissions()'::regprocedure);

  IF position('FROM public.app_permissions AS ap' in v_definition) = 0
     OR position('rp.granted = true' in v_definition) = 0
     OR position('rp.granted = true' in v_definition) = 0
     OR position('admin_role.role in (''superuser'', ''admin'')' in lower(v_definition)) = 0
     OR position('p.permission_key' in v_definition) > 0 THEN
    RAISE EXCEPTION 'get_my_permissions must join app_permissions.key and filter granted role permissions';
  END IF;

  IF has_function_privilege('anon', 'public.get_my_permissions()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_my_permissions()', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_my_permissions execution must remain authenticated-only';
  END IF;
END;
$test$;
