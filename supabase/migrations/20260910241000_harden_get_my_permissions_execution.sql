-- Keep the permission RPC authoritative without exposing RBAC metadata tables to clients.
create or replace FUNCTION public.get_my_permissions()
returns table(permission_key TEXT)
language sql
stable
security definer
set search_path = ''
as $
  SELECT ap.key
  FROM public.app_permissions AS ap
  WHERE EXISTS (
    SELECT 1
    FROM public.user_roles AS admin_role
    WHERE admin_role.user_id = (SELECT auth.uid())
      AND admin_role.role IN ('superuser', 'admin')
  )
  UNION
  SELECT rp.permission_key
  FROM public.user_roles AS ur
  JOIN public.role_permissions AS rp
    ON rp.role = ur.role::TEXT
  WHERE ur.user_id = (SELECT auth.uid())
    AND rp.granted = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles AS admin_role
      WHERE admin_role.user_id = (SELECT auth.uid())
        AND admin_role.role IN ('superuser', 'admin')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_permission_overrides AS uo
      WHERE uo.user_id = (SELECT auth.uid())
        AND uo.permission_key = rp.permission_key
    )
  UNION
  SELECT uo.permission_key
  FROM public.user_permission_overrides AS uo
  WHERE uo.user_id = (SELECT auth.uid())
    AND uo.granted = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles AS admin_role
      WHERE admin_role.user_id = (SELECT auth.uid())
        AND admin_role.role IN ('superuser', 'admin')
    );
$$;

revoke all ON FUNCTION public.get_my_permissions() from public, anon;
grant execute ON FUNCTION public.get_my_permissions() to authenticated;

drop policy if exists "role_permissions_select" on public.role_permissions;
