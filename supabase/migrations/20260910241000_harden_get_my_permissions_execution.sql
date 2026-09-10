-- Keep the permission RPC authoritative without exposing RBAC metadata tables to clients.
create or replace function public.get_my_permissions()
returns table(permission_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct p.permission_key
  from public.app_permissions p
  join public.role_permissions rp on rp.permission_key = p.permission_key
  join public.user_roles ur on ur.role = rp.role
  where ur.user_id = (select auth.uid())
  union
  select uo.permission_key
  from public.user_permission_overrides uo
  where uo.user_id = (select auth.uid())
    and uo.allowed = true
  except
  select uo.permission_key
  from public.user_permission_overrides uo
  where uo.user_id = (select auth.uid())
    and uo.allowed = false;
$$;

revoke all on function public.get_my_permissions() from public, anon;
grant execute on function public.get_my_permissions() to authenticated;

drop policy if exists "role_permissions_select" on public.role_permissions;
