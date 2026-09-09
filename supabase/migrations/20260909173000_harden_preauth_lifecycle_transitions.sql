-- Make pre-authorization workflow state changes server-authoritative.
-- Browser clients must use the atomic transition RPC rather than mutating
-- lifecycle columns directly.

create or replace function security_internal.transition_preauthorization_atomic(
  p_preauth_id uuid,
  p_target_state text,
  p_note text default null
)
returns public.pre_authorizations
language plpgsql
security definer
set search_path = ''
as $$
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

  if v_target not in ('Draft','PendingApproval','Approved','Rejected','Completed') then
    raise exception 'INVALID_TARGET_STATE' using errcode='22023';
  end if;

  if v_target = 'PendingApproval' or v_target = 'Draft' then
    if not security_internal.current_user_has_permission('preauth.write') then raise exception 'PREAUTH_WRITE_REQUIRED' using errcode='42501'; end if;
  else
    if not security_internal.current_user_has_permission('preauth.approve') then raise exception 'PREAUTH_APPROVE_REQUIRED' using errcode='42501'; end if;
  end if;

  if not (
    (v_current='Draft' and v_target='PendingApproval') or
    (v_current='PendingApproval' and v_target in ('Approved','Rejected','Draft')) or
    (v_current='Approved' and v_target in ('Completed','Rejected')) or
    (v_current='Rejected' and v_target='Draft')
  ) then
    raise exception 'INVALID_PREAUTH_TRANSITION: % -> %', v_current, v_target using errcode='22023';
  end if;

  if v_target='Rejected' and v_note is null then
    raise exception 'REJECTION_REASON_REQUIRED' using errcode='22023';
  end if;

  perform set_config('app.careflow_preauth_transition','1',true);
  v_status := case v_target
    when 'Draft' then 'draft'
    when 'PendingApproval' then 'pending'
    when 'Approved' then 'approved'
    when 'Rejected' then 'rejected'
    when 'Completed' then 'completed'
  end;

  update public.pre_authorizations
  set current_state=v_target,
      status=v_status,
      submitted_at=case when v_target='PendingApproval' then coalesce(submitted_at,now()) when v_target='Draft' then null else submitted_at end,
      approved_at=case when v_target='Approved' then now() when v_target in ('Draft','PendingApproval','Rejected') then null else approved_at end,
      approved_by=case when v_target='Approved' then v_uid when v_target in ('Draft','PendingApproval','Rejected') then null else approved_by end,
      rejection_reason=case when v_target='Rejected' then v_note when v_target in ('Draft','PendingApproval','Approved','Completed') then null else rejection_reason end,
      version=coalesce(version,0)+1
  where id=p_preauth_id
  returning * into v_row;

  select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)
    into v_items from public.preauth_items i where i.preauth_id=p_preauth_id;
  v_snapshot := jsonb_build_object('request',to_jsonb(v_row),'items',v_items,'transitioned_by',v_uid,'transitioned_at',now());
  select coalesce(max(version_number),0)+1 into v_next_version from public.preauth_versions where preauth_id=p_preauth_id;
  insert into public.preauth_versions(preauth_id,version_number,state,snapshot,change_note,edited_by,edited_by_name)
  values(p_preauth_id,v_next_version,v_target,v_snapshot,v_note,v_uid,coalesce((select email from auth.users where id=v_uid),''));
  return v_row;
end;
$$;

create or replace function public.transition_preauthorization_atomic(
  p_preauth_id uuid,
  p_target_state text,
  p_note text default null
)
returns public.pre_authorizations
language sql
set search_path = ''
as $$ select security_internal.transition_preauthorization_atomic($1,$2,$3); $$;

revoke execute on function public.transition_preauthorization_atomic(uuid,text,text) from public, anon;
grant execute on function public.transition_preauthorization_atomic(uuid,text,text) to authenticated;

create or replace function security_internal.guard_preauth_lifecycle_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.careflow_preauth_transition', true) = '1' then return new; end if;
  if new.current_state is distinct from old.current_state
     or new.status is distinct from old.status
     or new.submitted_at is distinct from old.submitted_at
     or new.approved_at is distinct from old.approved_at
     or new.approved_by is distinct from old.approved_by
     or new.rejection_reason is distinct from old.rejection_reason then
    raise exception 'PREAUTH_LIFECYCLE_RPC_REQUIRED' using errcode='42501', hint='Use public.transition_preauthorization_atomic for workflow state changes.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_preauth_lifecycle_mutation on public.pre_authorizations;
create trigger trg_guard_preauth_lifecycle_mutation
before update on public.pre_authorizations
for each row execute function security_internal.guard_preauth_lifecycle_mutation();

-- Authoring updates must not accept client-controlled lifecycle status.
create or replace function security_internal.update_preauthorization_atomic(
  p_preauth_id uuid, p_payload jsonb, p_items jsonb, p_reason text default 'amended'
)
returns public.pre_authorizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.pre_authorizations;
  v_item jsonb;
  v_total numeric := 0;
  v_qty numeric;
  v_unit numeric;
  v_fp text;
  v_existing uuid;
  v_facility uuid;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not security_internal.current_user_has_permission('preauth.write') then raise exception 'PERMISSION_DENIED' using errcode='42501'; end if;
  select * into v_row from public.pre_authorizations where id=p_preauth_id for update;
  if not found then raise exception 'PREAUTH_NOT_FOUND'; end if;
  v_facility := v_row.facility_id;
  if v_facility is null then raise exception 'FACILITY_REQUIRED'; end if;
  if not security_internal.user_has_facility_access(v_facility) then raise exception 'FACILITY_ACCESS_DENIED' using errcode='42501'; end if;
  if trim(coalesce(p_payload->>'client_name',v_row.client_name,''))='' then raise exception 'CLIENT_NAME_REQUIRED'; end if;
  if trim(coalesce(p_payload->>'insurer_name',v_row.insurer_name,''))='' then raise exception 'INSURER_NAME_REQUIRED'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'PREAUTH_ITEMS_REQUIRED'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if trim(coalesce(v_item->>'description',''))='' then raise exception 'CHARGE_DESCRIPTION_REQUIRED'; end if;
    v_qty := coalesce((v_item->>'quantity')::numeric,0); v_unit := coalesce((v_item->>'unit_price')::numeric,0);
    if v_qty <= 0 or v_unit < 0 then raise exception 'INVALID_CHARGE_VALUE'; end if;
    v_total := v_total + round(v_qty*v_unit,2);
  end loop;
  if round(coalesce((p_payload->>'total_cost')::numeric,v_total),2) <> round(v_total,2) then raise exception 'TOTAL_COST_MISMATCH'; end if;
  v_fp := public.pre_auth_complete_fingerprint(nullif(p_payload->>'patient_id','')::uuid,coalesce(nullif(trim(p_payload->>'client_name'),''),v_row.client_name),nullif(p_payload->>'client_date_of_birth','')::date,nullif(p_payload->>'client_identifier',''),nullif(p_payload->>'client_membership_number',''),nullif(p_payload->>'insurance_company_id','')::uuid,p_payload->>'insurer_name',p_payload->>'insurer_member_number',p_payload->>'insurer_plan_name',p_payload->>'insurer_policy_reference',nullif(p_payload->>'doctor_id','')::uuid,nullif(p_payload->>'procedure_id','')::uuid,nullif(p_payload->>'procedure_date','')::date,p_payload->>'diagnosis',v_total,p_items);
  select id into v_existing from public.pre_authorizations where facility_id=v_facility and dedup_fingerprint=v_fp and id<>p_preauth_id and created_at>=now()-interval '30 days' and lower(coalesce(status,''))<>'rejected' order by created_at desc limit 1;
  if v_existing is not null then raise exception 'DUPLICATE_PREAUTH:%',v_existing using errcode='23505'; end if;
  perform set_config('app.careflow_preauth_transition','1',true);
  update public.pre_authorizations set patient_id=nullif(p_payload->>'patient_id','')::uuid,client_name=coalesce(nullif(trim(p_payload->>'client_name'),''),v_row.client_name),client_date_of_birth=nullif(p_payload->>'client_date_of_birth','')::date,client_phone=nullif(p_payload->>'client_phone',''),client_email=nullif(p_payload->>'client_email',''),client_address=nullif(p_payload->>'client_address',''),client_identifier=nullif(p_payload->>'client_identifier',''),client_membership_number=nullif(p_payload->>'client_membership_number',''),doctor_id=nullif(p_payload->>'doctor_id','')::uuid,procedure_id=nullif(p_payload->>'procedure_id','')::uuid,diagnosis=nullif(p_payload->>'diagnosis',''),procedure_date=nullif(p_payload->>'procedure_date','')::date,insurance_company_id=nullif(p_payload->>'insurance_company_id','')::uuid,insurer_name=coalesce(nullif(trim(p_payload->>'insurer_name'),''),v_row.insurer_name),insurer_member_number=nullif(p_payload->>'insurer_member_number',''),insurer_plan_name=nullif(p_payload->>'insurer_plan_name',''),insurer_phone=nullif(p_payload->>'insurer_phone',''),insurer_email=nullif(p_payload->>'insurer_email',''),insurer_policy_reference=nullif(p_payload->>'insurer_policy_reference',''),provider_name=nullif(p_payload->>'provider_name',''),provider_address=nullif(p_payload->>'provider_address',''),provider_phone=nullif(p_payload->>'provider_phone',''),total_cost=round(v_total,2),accommodation_days=nullif(p_payload->>'accommodation_days','')::integer,clinical_notes=nullif(p_payload->>'clinical_notes',''),approval_notes=nullif(p_payload->>'approval_notes',''),custom_diagnoses=coalesce(p_payload->'custom_diagnoses','[]'::jsonb),diagnosis_ids=coalesce(p_payload->'diagnosis_ids','[]'::jsonb),template_id=nullif(p_payload->>'template_id','')::uuid,dedup_fingerprint=v_fp,duplicate_checked_at=now() where id=p_preauth_id returning * into v_row;
  delete from public.preauth_items where preauth_id=p_preauth_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::numeric; v_unit := (v_item->>'unit_price')::numeric;
    insert into public.preauth_items(preauth_id,description,quantity,unit_price,amount) values(p_preauth_id,trim(v_item->>'description'),v_qty::integer,v_unit,round(v_qty*v_unit,2));
  end loop;
  return v_row;
end;
$$;
