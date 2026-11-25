DO $permission_helper_repair$
DECLARE v_role_grant text; v_override_column text;
BEGIN
 v_role_grant := CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='role_permissions' AND column_name='granted') THEN 'rp.granted = true' ELSE 'true' END;
 v_override_column := CASE
  WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_permission_overrides' AND column_name='granted') THEN 'granted'
  WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_permission_overrides' AND column_name='allowed') THEN 'allowed'
  ELSE NULL END;
 IF v_override_column IS NULL THEN RAISE EXCEPTION 'Unsupported user_permission_overrides schema: expected granted or allowed'; END IF;
 EXECUTE format($ddl$
 CREATE OR REPLACE FUNCTION security_internal.current_user_has_permission(p_permission_key text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
 AS $function$
  SELECT security_internal.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  OR EXISTS(SELECT 1 FROM public.user_permission_overrides uo WHERE uo.user_id=(SELECT auth.uid()) AND uo.permission_key=p_permission_key AND uo.%I=true)
  OR (NOT EXISTS(SELECT 1 FROM public.user_permission_overrides uo WHERE uo.user_id=(SELECT auth.uid()) AND uo.permission_key=p_permission_key)
   AND EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.role_permissions rp ON rp.role::text=ur.role::text
    WHERE ur.user_id=(SELECT auth.uid()) AND rp.permission_key=p_permission_key AND %s));
 $function$;
 $ddl$,v_override_column,v_role_grant);
 REVOKE ALL ON FUNCTION security_internal.current_user_has_permission(text) FROM PUBLIC,anon;
 GRANT EXECUTE ON FUNCTION security_internal.current_user_has_permission(text) TO authenticated;
END;
$permission_helper_repair$;
COMMENT ON FUNCTION security_internal.current_user_has_permission(text) IS 'Effective permission helper supports both canonical and legacy RBAC schemas.';
