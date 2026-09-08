-- User account management: database-backed role defaults and per-user permission overrides.
create table if not exists public.app_permissions (key text primary key, label text not null, category text not null, description text not null default '', created_at timestamptz not null default now());
create table if not exists public.role_permissions (role text not null check (role in ('superuser','admin','claims_officer','accounts_officer','data_entry_officer','auditor','viewer')), permission_key text not null references public.app_permissions(key) on delete cascade, granted boolean not null default true, created_at timestamptz not null default now(), primary key (role, permission_key));
create table if not exists public.user_permission_overrides (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, permission_key text not null references public.app_permissions(key) on delete cascade, granted boolean not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (user_id, permission_key));
create index if not exists idx_user_permission_overrides_user_id on public.user_permission_overrides(user_id);

insert into public.app_permissions (key, label, category, description) values
('claims.read','View claims','Claims','View claims and claim records.'),('claims.write','Manage claims','Claims','Create and update claim records.'),('payments.read','View payments','Payments','View payment and settlement information.'),('payments.write','Manage payments','Payments','Create and update payment records.'),('preauth.read','View pre-authorizations','Pre-Authorization','View pre-authorization requests.'),('preauth.write','Prepare pre-authorizations','Pre-Authorization','Create, edit and prepare authorization request packages.'),('preauth.approve','Approve pre-authorizations','Pre-Authorization','Approve pre-authorization workflow actions where applicable.'),('masterdata.write','Manage master data','Administration','Create and update operational master data.'),('reports.read','View reports','Reporting','View operational and financial reports.'),('analytics.read','View analytics','Reporting','View analytics and dashboards.'),('ledger.read','View ledger','Finance','View ledger information.'),('ledger.write','Manage ledger','Finance','Create and update ledger information.'),('users.manage','Manage users','Administration','Manage user accounts, roles and privileges.'),('audit.read','View audit records','Administration','View audit and security records.'),('settings.manage','Manage settings','Administration','Manage system configuration and settings.')
on conflict (key) do update set label=excluded.label, category=excluded.category, description=excluded.description;

insert into public.role_permissions (role, permission_key, granted) select 'superuser', key, true from public.app_permissions on conflict (role, permission_key) do update set granted=excluded.granted;
insert into public.role_permissions (role, permission_key, granted) values
('admin','claims.read',true),('admin','claims.write',true),('admin','payments.read',true),('admin','payments.write',true),('admin','preauth.read',true),('admin','preauth.write',true),('admin','preauth.approve',true),('admin','masterdata.write',true),('admin','reports.read',true),('admin','analytics.read',true),('admin','ledger.read',true),('admin','ledger.write',true),('admin','users.manage',true),('admin','audit.read',true),('admin','settings.manage',true),
('claims_officer','claims.read',true),('claims_officer','claims.write',true),('claims_officer','payments.read',true),('claims_officer','preauth.read',true),('claims_officer','preauth.write',true),('claims_officer','preauth.approve',true),('claims_officer','masterdata.write',true),('claims_officer','reports.read',true),('claims_officer','analytics.read',true),
('accounts_officer','claims.read',true),('accounts_officer','payments.read',true),('accounts_officer','payments.write',true),('accounts_officer','ledger.read',true),('accounts_officer','ledger.write',true),('accounts_officer','reports.read',true),('accounts_officer','analytics.read',true),
('data_entry_officer','claims.read',true),('data_entry_officer','claims.write',true),('data_entry_officer','preauth.read',true),('data_entry_officer','preauth.write',true),('data_entry_officer','masterdata.write',true),
('auditor','claims.read',true),('auditor','payments.read',true),('auditor','preauth.read',true),('auditor','reports.read',true),('auditor','analytics.read',true),('auditor','ledger.read',true),('auditor','audit.read',true),
('viewer','claims.read',true),('viewer','payments.read',true),('viewer','preauth.read',true),('viewer','reports.read',true),('viewer','analytics.read',true)
on conflict (role, permission_key) do update set granted=excluded.granted;

alter table public.app_permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_permission_overrides enable row level security;

drop policy if exists "authenticated can read permission catalog" on public.app_permissions;
create policy "authenticated can read permission catalog" on public.app_permissions for select to authenticated using (true);
drop policy if exists "authenticated can read role permissions" on public.role_permissions;
create policy "authenticated can read role permissions" on public.role_permissions for select to authenticated using (true);
drop policy if exists "users can read own permission overrides" on public.user_permission_overrides;
create policy "users can read own permission overrides" on public.user_permission_overrides for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "superusers manage permission overrides" on public.user_permission_overrides;
create policy "superusers manage permission overrides" on public.user_permission_overrides for all to authenticated using (public.current_user_has_any_role(ARRAY['superuser']::public.app_role[])) with check (public.current_user_has_any_role(ARRAY['superuser']::public.app_role[]));
drop policy if exists "superusers manage role permissions" on public.role_permissions;
create policy "superusers manage role permissions" on public.role_permissions for all to authenticated using (public.current_user_has_any_role(ARRAY['superuser']::public.app_role[])) with check (public.current_user_has_any_role(ARRAY['superuser']::public.app_role[]));
drop policy if exists "superusers manage permission catalog" on public.app_permissions;
create policy "superusers manage permission catalog" on public.app_permissions for all to authenticated using (public.current_user_has_any_role(ARRAY['superuser']::public.app_role[])) with check (public.current_user_has_any_role(ARRAY['superuser']::public.app_role[]));

create or replace function public.get_my_permissions()
returns table(permission_key text)
language sql stable security invoker set search_path=public
as $$
  select rp.permission_key from public.user_roles ur join public.role_permissions rp on rp.role=ur.role::text and rp.granted=true where ur.user_id=(select auth.uid()) and not exists (select 1 from public.user_permission_overrides uo where uo.user_id=(select auth.uid()) and uo.permission_key=rp.permission_key)
  union
  select uo.permission_key from public.user_permission_overrides uo where uo.user_id=(select auth.uid()) and uo.granted=true;
$$;
grant execute on function public.get_my_permissions() to authenticated;
revoke execute on function public.get_my_permissions() from anon;

create or replace function public.touch_user_permission_override_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists trg_user_permission_override_updated_at on public.user_permission_overrides;
create trigger trg_user_permission_override_updated_at before update on public.user_permission_overrides for each row execute function public.touch_user_permission_override_updated_at();
