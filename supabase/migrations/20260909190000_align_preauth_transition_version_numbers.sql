-- Keep immutable pre-authorization history version numbers aligned with the parent row.
-- The parent version is incremented atomically by the transition function; using that
-- exact value prevents the legacy browser snapshot path from creating an extra version.

CREATE OR REPLACE FUNCTION security_internal.transition_preauthorization_atomic(
  p_preauth_id uuid,
  p_target_state text,
  p_note text default null
)
RETURNS public.pre_authorizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.pre_authorizations;
  v_current text;
  v_target text := trim(coalesce(p_target_state,''));
  v_note text := nullif(trim(coalesce(p_note,'')), '');
  v_items jsonb;
  v_snapshot jsonb;
  v_next_version integer;
  v_status text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v_row from public.pre_authorizations where id=p_preauth_id for update;
  if not found then raise exception 'PREAUTH_NOT_FOUND' using errcode='P0002'; end if;
  if v_row.facility_id is null then raise exception 'FACILITY_REQUIRED'; end if;
  if not security_internal.user_has_facility_access(v_row.facility_id) then raise exception 'FACILITY_ACCESS_DENIED' using errcode='42501'; end if;
  v_current := case lower(coalesce(v_row.current_state,v_row.status,''))
    when 'draft' then 'Draft'
    when 'pending' then 'PendingApproval'
    when 'pendingapproval' then 'PendingApproval'
    when 'approved' then 'Approved'
    when 'rejected' then 'Rejected'
    when 'completed' then 'Completed'
    else 'Draft'
  end;
  if v_target not in ('Draft','PendingApproval','Approved','Rejected','Completed') then raise exception 'INVALID_TARGET_STATE' using errcode='22023'; end if;
  if v_target in ('PendingApproval','Draft') then
    if not security_internal.current_user_has_permission('preauth.write') then raise exception 'PREAUTH_WRITE_REQUIRED' using errcode='42501'; end if;
  else
    if not security_internal.current_user_has_permission('preauth.approve') then raise exception 'PREAUTH_APPROVE_REQUIRED' using errcode='42501'; end if;
  end if;
  if not ((v_current='Draft' and v_target='PendingApproval') or (v_current='PendingApproval' and v_target in ('Approved','Rejected','Draft')) or (v_current='Approved' and v_target in ('Completed','Rejected')) or (v_current='Rejected' and v_target='Draft')) then
    raise exception 'INVALID_PREAUTH_TRANSITION: % -> %',v_current,v_target using errcode='22023';
  end if;
  if v_target='Rejected' and v_note is null then raise exception 'REJECTION_REASON_REQUIRED' using errcode='22023'; end if;
  perform set_config('app.careflow_preauth_transition','1',true);
  v_status := case v_target when 'Draft' then 'draft' when 'PendingApproval' then 'pending' when 'Approved' then 'approved' when 'Rejected' then 'rejected' when 'Completed' then 'completed' end;
  update public.pre_authorizations
  set current_state=v_target,
      status=v_status,
      submitted_at=case when v_target='PendingApproval' then coalesce(submitted_at,now()) when v_target='Draft' then null else submitted_at end,
      approved_at=case when v_target='Approved' then now() when v_target in ('Draft','PendingApproval','Rejected') then null else approved_at end,
      approved_by=case when v_target='Approved' then v_uid when v_target in ('Draft','PendingApproval','Rejected') then null else approved_by end,
      rejection_reason=case when v_target='Rejected' then v_note when v_target in ('Draft','PendingApproval','Approved','Completed') then null else rejection_reason end,
      version=coalesce(version,0)+1
  where id=p_preauth_id returning * into v_row;
  select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb) into v_items from public.preauth_items i where i.preah_id=p_preauth_id;
  v_snapshot := jsonb_build_object('request',to_jsonb(v_row),'items',v_items,'transitioned_by',v_uid,'transitioned_at',now());
  v_next_version := coalesce(v_row.version, 1);
  insert into public.preauth_versions(preauth_id,version_number,state,snapshot,change_note,edited_by,edited_by_name)
  values(p_preauth_id,v_next_version,v_target,v_snapshot,v_note,v_uid,coalesce((select email from auth.users where id=v_uid),''))
  on conflict (preauth_id,version_number) do nothing;
  return v_row;
end;
$$;
