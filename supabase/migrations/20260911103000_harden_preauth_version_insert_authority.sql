-- Bind immutable preauthorization version creation to the authenticated editor.
-- The table uses edited_by rather than created_by.

drop policy if exists "preauth_versions_insert_permission" on public.preauth_versions;

create policy "preauth_versions_insert_permission"
  on public.preauth_versions for insert to authenticated
  with check (
    security_internal.current_user_has_permission('preauth.write'::text)
    and (edited_by = (select auth.uid()))
    and exists (
      select 1
      from public.pre_authorizations p
      where p.id = preauth_versions.preauth_id
        and p.facility_id is not null
        and security_internal.user_has_facility_access(p.facility_id)
    )
  );

revoke insert on public.preauth_versions from anon;
revoke update, delete on public.preauth_versions from anon, authenticated;
