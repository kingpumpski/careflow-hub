-- Correct the administrative metadata policies introduced by the RBAC hardening pass.
-- Authorization helpers query these tables under SECURITY DEFINER; their RLS policies
-- must not call the helper itself, otherwise policy evaluation can recurse.

do $$
begin
  if to_regclass('public.role_permissions') is not null then
    execute 'drop policy if exists "Authorized users read role permissions" on public.role_permissions';
  end if;

  if to_regclass('public.user_permission_overrides') is not null then
    execute 'drop policy if exists "Authorized users read permission overrides" on public.user_permission_overrides';
    execute 'drop policy if exists "Authorized users manage permission overrides" on public.user_permission_overrides';

    execute 'create policy "Users read own permission overrides" on public.user_permission_overrides for select to authenticated using ((select auth.uid()) = user_id)';
    execute 'create policy "Administrators read permission overrides" on public.user_permission_overrides for select to authenticated using (public.has_role((select auth.uid()), ''superuser''::public.app_role) or public.has_role((select auth.uid()), ''admin''::public.app_role))';
    execute 'create policy "Administrators manage permission overrides" on public.user_permission_overrides for all to authenticated using (public.has_role((select auth.uid()), ''superuser''::public.app_role) or public.has_role((select auth.uid()), ''admin''::public.app_role)) with check (public.has_role((select auth.uid()), ''superuser''::public.app_role) or public.has_role((select auth.uid()), ''admin''::public.app_role))';
  end if;
end $$;


-- Runtime facility policy correction: avoid direct self-reference in facility membership RLS.
drop policy if exists facilities_select_member on public.facilities;
create policy facilities_select_member on public.facilities
for select to authenticated
using (
  public.user_has_facility_access(facilities.id)
  or exists (select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role in ('superuser','admin'))
);

drop policy if exists facility_memberships_select_member on public.facility_memberships;
create policy facility_memberships_select_member on public.facility_memberships
for select to authenticated
using (
  user_id=(select auth.uid())
  or public.user_has_facility_access(facility_memberships.facility_id)
  or exists (select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role in ('superuser','admin'))
);
