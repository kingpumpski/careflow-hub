DO $permission_repair$
DECLARE v_catalog_key text; v_role_grant text; v_override_grant text; v_override_column text;
BEGIN
 SELECT CASE
  WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='app_permissions' AND column_name='key') THEN 'key'
  WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='app_permissions' AND column_name='permission_key') THEN 'permission_key'
  ELSE NULL END INTO v_catalog_key;
 IF v_catalog_key IS NULL THEN RAISE EXCEPTION 'Unsupported app_permissions schema: expected key or permission_key'; END IF;
 v_role_grant := CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='role_permissions' AND column_name='granted') THEN 'rp.granted = true' ELSE 'true' END;
 v_override_column := CASE
  WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_permission_overrides' AND column_name='granted') THEN 'granted'
  WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_permission_overrides' AND column_name='allowed') THEN 'allowed'
  ELSE NULL END;
 IF v_override_column IS NULL THEN RAISE EXCEPTION 'Unsupported user_permission_overrides schema: expected granted or allowed'; END IF;
 v_override_grant := format('uo.%I = true',v_override_column);
 EXECUTE format($ddl$
 CREATE OR REPLACE FUNCTION public.get_my_permissions()
 RETURNS TABLE(permission_key text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
 AS $function$
  SELECT ap.%I FROM public.app_permissions ap
  WHERE EXISTS(SELECT 1 FROM public.user_roles ar WHERE ar.user_id=(SELECT auth.uid()) AND ar.role::text IN ('superuser','admin'))
  UNION
  SELECT rp.permission_key FROM public.user_roles ur JOIN public.role_permissions rp ON rp.role::text=ur.role::text
  WHERE ur.user_id=(SELECT auth.uid()) AND %s
   AND NOT EXISTS(SELECT 1 FROM public.user_roles ar WHERE ar.user_id=(SELECT auth.uid()) AND ar.role::text IN ('superuser','admin'))
   AND NOT EXISTS(SELECT 1 FROM public.user_permission_overrides uo WHERE uo.user_id=(SELECT auth.uid()) AND uo.permission_key=rp.permission_key)
  UNION
  SELECT uo.permission_key FROM public.user_permission_overrides uo
  WHERE uo.user_id=(SELECT auth.uid()) AND %s
   AND NOT EXISTS(SELECT 1 FROM public.user_roles ar WHERE ar.user_id=(SELECT auth.uid()) AND ar.role::text IN ('superuser','admin'));
 $function$;
 $ddl$,v_catalog_key,v_role_grant,v_override_grant);
 REVOKE ALL ON FUNCTION public.get_my_permissions() FROM PUBLIC,anon;
 GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;
END;
$permission_repair$;