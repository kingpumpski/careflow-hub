-- Validate the permission RPC against either supported deployed RBAC layout.
DO $test$
DECLARE v_definition text; v_catalog_key text; v_role_grant text; v_override_column text;
BEGIN
 SELECT CASE
  WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='app_permissions' AND column_name='key') THEN 'key'
  WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='app_permissions' AND column_name='permission_key') THEN 'permission_key'
  ELSE NULL END INTO v_catalog_key;
 IF v_catalog_key IS NULL THEN RAISE EXCEPTION 'Unsupported permission catalogue'; END IF;
 v_role_grant:=CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='role_permissions' AND column_name='granted') THEN 'rp.granted = true' ELSE 'true' END;
 v_override_column:=CASE
  WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_permission_overrides' AND column_name='granted') THEN 'granted'
  WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_permission_overrides' AND column_name='allowed') THEN 'allowed'
  ELSE NULL END;
 IF v_override_column IS NULL THEN RAISE EXCEPTION 'Unsupported permission override schema'; END IF;
 v_definition:=lower(pg_get_functiondef('public.get_my_permissions()'::regprocedure));
 IF position('public.app_permissions' in v_definition)=0 OR position('rp.permission_key' in v_definition)=0
  OR position(v_catalog_key in v_definition)=0 OR position(v_role_grant in v_definition)=0
  OR position('uo.'||v_override_column||'=true' in replace(v_definition,' ',''))=0
  OR position('ar.role::text in' in v_definition)=0 THEN
  RAISE EXCEPTION 'get_my_permissions does not match deployed RBAC schema';
 END IF;
 IF has_function_privilege('anon','public.get_my_permissions()','EXECUTE') OR NOT has_function_privilege('authenticated','public.get_my_permissions()','EXECUTE') THEN
  RAISE EXCEPTION 'get_my_permissions execution must remain authenticated-only';
 END IF;
END;
$test$;
