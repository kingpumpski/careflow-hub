-- Prevent facility-scoped preauthorization line items from bypassing preauth.read.
-- The previous policy enforced facility ownership but did not enforce the
-- permission boundary, allowing any authenticated user with facility access
-- to read preauthorization items directly.

drop policy if exists "preauth_items_select_facility" on public.preauth_items;

create policy "preauth_items_select_permission"
  on public.preauth_items
  for select
  to authenticated
  using (
    security_internal.current_user_has_permission('preauth.read'::text)
    and exists (
      select 1
      from public.pre_authorizations p
      where p.id = preauth_items.preauth_id
        and (
          (p.facility_id is not null and security_internal.user_has_facility_access(p.facility_id))
          or (p.facility_id is null and p.created_by = (select auth.uid() as uid))
        )
    )
  );
