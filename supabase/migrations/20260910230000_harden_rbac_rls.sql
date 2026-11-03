-- Replace legacy broad authenticated CRUD policies with permission-aware RLS.
-- The frontend RBAC is advisory; these policies enforce authorization at the database boundary.

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
    or exists (
      select 1
      from public.user_permission_overrides uo
      where uo.user_id = (select auth.uid())
        and uo.permission_key = p_permission_key
        and uo.granted = true
    );
$$;

grant execute on function public.current_user_has_permission(text) to authenticated;
revoke execute on function public.current_user_has_permission(text) from anon;

-- Remove legacy authenticated-wide data policies. Policy names are intentionally explicit
-- so this migration remains idempotent on environments where some policies were already removed.
do $$
declare
  policy_name text;
  table_name text;
begin
  foreach table_name in array array[
    'insurance_companies','client_companies','doctors','procedures','patients',
    'pre_authorizations','preauth_items','claims','payments','withholding_tax'
  ] loop
    foreach policy_name in array array[
      'Authenticated read ' || table_name,
      'Authenticated insert ' || table_name,
      'Authenticated update ' || table_name,
      'Authenticated delete ' || table_name
    ] loop
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
    end loop;
  end loop;
end $$;

-- Master/reference data.
create policy "permission read insurance companies" on public.insurance_companies
  for select to authenticated using (public.current_user_has_permission('masterdata.write'));
create policy "permission write insurance companies" on public.insurance_companies
  for all to authenticated using (public.current_user_has_permission('masterdata.write'))
  with check (public.current_user_has_permission('masterdata.write'));

create policy "permission read client companies" on public.client_companies
  for select to authenticated using (public.current_user_has_permission('masterdata.write'));
create policy "permission write client companies" on public.client_companies
  for all to authenticated using (public.current_user_has_permission('masterdata.write'))
  with check (public.current_user_has_permission('masterdata.write'));

create policy "permission read doctors" on public.doctors
  for select to authenticated using (public.current_user_has_permission('masterdata.write'));
create policy "permission write doctors" on public.doctors
  for all to authenticated using (public.current_user_has_permission('masterdata.write'))
  with check (public.current_user_has_permission('masterdata.write'));

create policy "permission read procedures" on public.procedures
  for select to authenticated using (public.current_user_has_permission('masterdata.write'));
create policy "permission write procedures" on public.procedures
  for all to authenticated using (public.current_user_has_permission('masterdata.write'))
  with check (public.current_user_has_permission('masterdata.write'));

-- Patients are operational data: read access follows claims/preauth visibility;
-- mutations require claims or preauth write authority.
create policy "permission read patients" on public.patients
  for select to authenticated using (
    public.current_user_has_permission('claims.read')
    or public.current_user_has_permission('preauth.read')
  );
create policy "permission write patients" on public.patients
  for all to authenticated using (
    public.current_user_has_permission('claims.write')
    or public.current_user_has_permission('preauth.write')
  ) with check (
    public.current_user_has_permission('claims.write')
    or public.current_user_has_permission('preauth.write')
  );

-- Pre-authorizations and their line items.
create policy "permission read pre authorizations" on public.pre_authorizations
  for select to authenticated using (public.current_user_has_permission('preauth.read'));
create policy "permission write pre authorizations" on public.pre_authorizations
  for all to authenticated using (public.current_user_has_permission('preauth.write'))
  with check (public.current_user_has_permission('preauth.write'));

create policy "permission read preauth items" on public.preauth_items
  for select to authenticated using (public.current_user_has_permission('preauth.read'));
create policy "permission write preauth items" on public.preauth_items
  for all to authenticated using (public.current_user_has_permission('preauth.write'))
  with check (public.current_user_has_permission('preauth.write'));

-- Claims.
create policy "permission read claims" on public.claims
  for select to authenticated using (public.current_user_has_permission('claims.read'));
create policy "permission write claims" on public.claims
  for all to authenticated using (public.current_user_has_permission('claims.write'))
  with check (public.current_user_has_permission('claims.write'));

-- Payments.
create policy "permission read payments" on public.payments
  for select to authenticated using (public.current_user_has_permission('payments.read'));
create policy "permission write payments" on public.payments
  for all to authenticated using (public.current_user_has_permission('payments.write'))
  with check (public.current_user_has_permission('payments.write'));

-- Withholding tax is finance data.
create policy "permission read withholding tax" on public.withholding_tax
  for select to authenticated using (
    public.current_user_has_permission('ledger.read')
    or public.current_user_has_permission('reports.read')
  );
create policy "permission write withholding tax" on public.withholding_tax
  for all to authenticated using (public.current_user_has_permission('ledger.write'))
  with check (public.current_user_has_permission('ledger.write'));

-- Profiles: users may manage their own profile; privileged user-management roles may manage all.
drop policy if exists "Users can view all profiles" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can view permitted profiles" on public.profiles
  for select to authenticated using (
    (select auth.uid()) = id
    or public.current_user_has_permission('users.manage')
  );
create policy "Users can update permitted profiles" on public.profiles
  for update to authenticated using (
    (select auth.uid()) = id
    or public.current_user_has_permission('users.manage')
  ) with check (
    (select auth.uid()) = id
    or public.current_user_has_permission('users.manage')
  );

-- Settings remain restricted to settings managers.
drop policy if exists "Authenticated read system_settings" on public.system_settings;
drop policy if exists "Superusers manage settings" on public.system_settings;
create policy "permission read system settings" on public.system_settings
  for select to authenticated using (public.current_user_has_permission('settings.manage'));
create policy "permission manage system settings" on public.system_settings
  for all to authenticated using (public.current_user_has_permission('settings.manage'))
  with check (public.current_user_has_permission('settings.manage'));

-- Notifications remain user-scoped. Inserts are restricted to the notification owner
-- or a privileged system actor rather than any authenticated user.
drop policy if exists "Users read own notifications" on public.notifications;
drop policy if exists "Users update own notifications" on public.notifications;
drop policy if exists "System insert notifications" on public.notifications;
create policy "Users read own notifications" on public.notifications
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users update own notifications" on public.notifications
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Authorized notification inserts" on public.notifications
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    or public.current_user_has_permission('users.manage')
  );

-- Explicitly prevent anonymous execution of the authorization helper.
revoke all on function public.current_user_has_permission(text) from public;
grant execute on function public.current_user_has_permission(text) to authenticated;
