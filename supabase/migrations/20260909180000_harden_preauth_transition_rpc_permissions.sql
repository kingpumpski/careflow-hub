-- Expose the lifecycle transition through a narrowly scoped Data API wrapper.
-- Authorization remains server-side in security_internal.transition_preauthorization_atomic.
create or replace function public.transition_preauthorization_atomic(
  p_preauth_id uuid,
  p_target_state text,
  p_note text default null
)
returns public.pre_authorizations
language sql
security invoker
set search_path = ''
as $$
  select security_internal.transition_preauthorization_atomic(
    p_preauth_id,
    p_target_state,
    p_note
  );
$$;

revoke execute on function public.transition_preauthorization_atomic(uuid, text, text)
  from public, anon;
grant execute on function public.transition_preauthorization_atomic(uuid, text, text)
  to authenticated;

-- Lifecycle snapshots are audit evidence. Browser users must not mutate or delete them.
drop policy if exists preauth_versions_update_permission on public.preauth_versions;
create policy preauth_versions_update_permission on public.preauth_versions
for update to authenticated
using (false)
with check (false);

drop policy if exists preauth_versions_delete_admin on public.preauth_versions;
create policy preauth_versions_delete_admin on public.preauth_versions
for delete to authenticated
using (false);
