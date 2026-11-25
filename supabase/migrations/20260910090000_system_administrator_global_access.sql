-- System administrators are authoritative platform operators.
-- Their role grants full project access regardless of permission overrides or
-- facility membership, so they can administer the system and assist other users.

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

create or replace function security_internal.user_has_facility_access(p_facility_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    security_internal.current_user_has_any_role(
      array['superuser','admin']::public.app_role[]
    )
    or exists (
      select 1
      from public.facility_memberships fm
      where fm.facility_id = p_facility_id
        and fm.user_id = (select auth.uid())
        and fm.status = 'active'
    );
$$;

-- Keep the legacy public helper semantically aligned even though direct execution
-- is intentionally revoked by the security-helper hardening migrations.
create or replace function public.user_has_facility_access(p_facility_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    security_internal.current_user_has_any_role(
      array['superuser','admin']::public.app_role[]
    )
    or exists (
      select 1
      from public.facility_memberships fm
      where fm.facility_id = p_facility_id
        and fm.user_id = (select auth.uid())
        and fm.status = 'active'
    );
$$;

-- The browser permission catalog/RPC must expose the same role-authoritative model
-- used by RLS and SECURITY DEFINER pre-authorization operations.
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

comment on function security_internal.current_user_has_permission(text) is
  'Returns effective permission; superuser and admin roles are globally authoritative.';
comment on function security_internal.user_has_facility_access(uuid) is
  'Returns facility access; superuser and admin roles bypass facility membership.';
comment on function public.get_my_permissions() is
  'Returns effective permissions; superuser and admin roles receive the complete permission catalog.';
