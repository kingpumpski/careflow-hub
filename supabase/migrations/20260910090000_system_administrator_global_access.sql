-- System administrators are authoritative platform operators.
-- Their role grants full project access regardless of permission overrides or
-- facility membership, so they can administer the system and assist other users.

create or replace function security_internal.current_user_has_permission(p_permission_key text)
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
create or replace function public.get_my_permissions()
returns table(permission_key text)
language sql stable security invoker set search_path=public
as $$
  select ap.key
  from public.app_permissions ap
  where exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role in ('superuser','admin')
  )
  union
  select rp.permission_key
  from public.user_roles ur
  join public.role_permissions rp on rp.role=ur.role::text and rp.granted=true
  where ur.user_id=(select auth.uid())
    and not exists (
      select 1
      from public.user_permission_overrides uo
      where uo.user_id=(select auth.uid())
        and uo.permission_key=rp.permission_key
    )
  union
  select uo.permission_key
  from public.user_permission_overrides uo
  where uo.user_id=(select auth.uid())
    and uo.granted=true;
$$;

comment on function security_internal.current_user_has_permission(text) is
  'Returns effective permission; superuser and admin roles are globally authoritative.';
comment on function security_internal.user_has_facility_access(uuid) is
  'Returns facility access; superuser and admin roles bypass facility membership.';
comment on function public.get_my_permissions() is
  'Returns effective permissions; superuser and admin roles receive the complete permission catalog.';
