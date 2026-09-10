-- Keep database authorization aligned with the application's global administrator model.
-- superuser/admin are authoritative system roles and cannot be reduced by permission overrides.

create or replace function public.current_user_has_permission(p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role in ('superuser'::public.app_role, 'admin'::public.app_role)
    )
    or (
      exists (
        select 1
        from public.user_roles ur
        join public.role_permissions rp
          on rp.role = ur.role::text
         and rp.permission_key = p_permission_key
         and rp.granted = true
        where ur.user_id = (select auth.uid())
      )
      and not exists (
        select 1
        from public.user_permission_overrides uo
        where uo.user_id = (select auth.uid())
          and uo.permission_key = p_permission_key
          and uo.granted = false
      )
    )
    or exists (
      select 1
      from public.user_permission_overrides uo
      where uo.user_id = (select auth.uid())
        and uo.permission_key = p_permission_key
        and uo.granted = true
    );
$$;

revoke all on function public.current_user_has_permission(text) from public;
grant execute on function public.current_user_has_permission(text) to authenticated;

-- Role assignments are security-sensitive. Users may inspect their own assignments;
-- only the existing superuser authority may administer assignments.
drop policy if exists "Users can view roles" on public.user_roles;
drop policy if exists "Superusers can manage roles" on public.user_roles;

create policy "Users can view own roles" on public.user_roles
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or public.current_user_has_permission('users.manage')
  );

create policy "Superusers manage roles" on public.user_roles
  for all to authenticated
  using (public.has_role((select auth.uid()), 'superuser'::public.app_role))
  with check (public.has_role((select auth.uid()), 'superuser'::public.app_role));

-- Permission definitions and overrides are administrative configuration.
-- Keep them inaccessible to ordinary authenticated users if these tables exist.
do $$
begin
  if to_regclass('public.role_permissions') is not null then
    execute 'alter table public.role_permissions enable row level security';
    execute 'drop policy if exists "Authenticated can read role permissions" on public.role_permissions';
    execute 'create policy "Authorized users read role permissions" on public.role_permissions for select to authenticated using (public.current_user_has_permission(''users.manage''))';
  end if;

  if to_regclass('public.user_permission_overrides') is not null then
    execute 'alter table public.user_permission_overrides enable row level security';
    execute 'drop policy if exists "Authenticated can read permission overrides" on public.user_permission_overrides';
    execute 'create policy "Authorized users read permission overrides" on public.user_permission_overrides for select to authenticated using ((select auth.uid()) = user_id or public.current_user_has_permission(''users.manage''))';
    execute 'drop policy if exists "Authorized users manage permission overrides" on public.user_permission_overrides';
    execute 'create policy "Authorized users manage permission overrides" on public.user_permission_overrides for all to authenticated using (public.current_user_has_permission(''users.manage'')) with check (public.current_user_has_permission(''users.manage''))';
  end if;
end $$;
