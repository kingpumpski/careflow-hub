-- Forward repair for environments where the historical permission RPC migration has already been recorded.
-- Preserve global superuser/admin access and respect explicit per-user overrides for ordinary users.
create or replace function public.get_my_permissions()
returns table(permission_key text)
language sql
stable
security definer
set search_path = ''
as $perm$
  select ap.key
  from public.app_permissions as ap
  where exists (
    select 1
    from public.user_roles as admin_role
    where admin_role.user_id = (select auth.uid())
      and admin_role.role in ('superuser', 'admin')
  )
  union
  select rp.permission_key
  from public.user_roles as ur
  join public.role_permissions as rp
    on rp.role = ur.role::text
  where ur.user_id = (select auth.uid())
    and rp.granted = true
    and not exists (
      select 1
      from public.user_roles as admin_role
      where admin_role.user_id = (select auth.uid())
        and admin_role.role in ('superuser', 'admin')
    )
    and not exists (
      select 1
      from public.user_permission_overrides as uo
      where uo.user_id = (select auth.uid())
        and uo.permission_key = rp.permission_key
    )
  union
  select uo.permission_key
  from public.user_permission_overrides as uo
  where uo.user_id = (select auth.uid())
    and uo.granted = true
    and not exists (
      select 1
      from public.user_roles as admin_role
      where admin_role.user_id = (select auth.uid())
        and admin_role.role in ('superuser', 'admin')
    );
$perm$;

revoke all on function public.get_my_permissions() from public, anon;
grant execute on function public.get_my_permissions() to authenticated;
