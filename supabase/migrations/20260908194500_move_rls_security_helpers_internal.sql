-- Move RLS-only SECURITY DEFINER helpers out of the exposed public schema.
-- These functions are implementation details for row-level security and are not
-- part of the application's RPC/API surface.

create schema if not exists security_internal;

revoke all on schema security_internal from public;
grant usage on schema security_internal to authenticated;

drop function if exists security_internal.current_user_has_any_role(public.app_role[]);
drop function if exists security_internal.current_user_has_permission(text);
drop function if exists security_internal.user_has_facility_access(uuid);

create function security_internal.current_user_has_any_role(p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = any (p_roles)
  );
$$;

create function security_internal.current_user_has_permission(p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.user_permission_overrides uo
      where uo.user_id = (select auth.uid())
        and uo.permission_key = p_permission_key
        and uo.allowed = true
    )
    or (
      not exists (
        select 1
        from public.user_permission_overrides uo
        where uo.user_id = (select auth.uid())
          and uo.permission_key = p_permission_key
      )
      and exists (
        select 1
        from public.user_roles ur
        join public.role_permissions rp on rp.role = ur.role
        where ur.user_id = (select auth.uid())
          and rp.permission_key = p_permission_key
      )
    );
$$;

create function security_internal.user_has_facility_access(p_facility_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.facility_memberships fm
    where fm.facility_id = p_facility_id
      and fm.user_id = (select auth.uid())
      and fm.status = 'active'
  );
$$;

revoke all on function security_internal.current_user_has_any_role(public.app_role[]) from public;
revoke all on function security_internal.current_user_has_permission(text) from public;
revoke all on function security_internal.user_has_facility_access(uuid) from public;
grant execute on function security_internal.current_user_has_any_role(public.app_role[]) to authenticated;
grant execute on function security_internal.current_user_has_permission(text) to authenticated;
grant execute on function security_internal.user_has_facility_access(uuid) to authenticated;

-- Rebind every existing policy expression that referenced the public helper.
do $$
declare
  p record;
  using_expr text;
  check_expr text;
  sql text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') ilike '%current_user_has_any_role%'
        or coalesce(qual, '') ilike '%current_user_has_permission%'
        or coalesce(qual, '') ilike '%user_has_facility_access%'
        or coalesce(with_check, '') ilike '%current_user_has_any_role%'
        or coalesce(with_check, '') ilike '%current_user_has_permission%'
        or coalesce(with_check, '') ilike '%user_has_facility_access%'
      )
  loop
    using_expr := p.qual;
    check_expr := p.with_check;

    if using_expr is not null then
      using_expr := replace(using_expr, 'current_user_has_any_role(', 'security_internal.current_user_has_any_role(');
      using_expr := replace(using_expr, 'current_user_has_permission(', 'security_internal.current_user_has_permission(');
      using_expr := replace(using_expr, 'user_has_facility_access(', 'security_internal.user_has_facility_access(');
    end if;

    if check_expr is not null then
      check_expr := replace(check_expr, 'current_user_has_any_role(', 'security_internal.current_user_has_any_role(');
      check_expr := replace(check_expr, 'current_user_has_permission(', 'security_internal.current_user_has_permission(');
      check_expr := replace(check_expr, 'user_has_facility_access(', 'security_internal.user_has_facility_access(');
    end if;

    if using_expr is not null and check_expr is not null then
      sql := format('alter policy %I on %I.%I using (%s) with check (%s)', p.policyname, p.schemaname, p.tablename, using_expr, check_expr);
    elsif using_expr is not null then
      sql := format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, using_expr);
    elsif check_expr is not null then
      sql := format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, check_expr);
    else
      continue;
    end if;

    execute sql;
  end loop;
end;
$$;

-- The public copies must not remain callable through PostgREST RPC.
revoke execute on function public.current_user_has_any_role(public.app_role[]) from public, anon, authenticated;
revoke execute on function public.current_user_has_permission(text) from public, anon, authenticated;
revoke execute on function public.user_has_facility_access(uuid) from public, anon, authenticated;
