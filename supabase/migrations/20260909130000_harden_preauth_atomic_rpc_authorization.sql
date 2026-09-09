-- Harden SECURITY DEFINER pre-authorization atomic operations.
-- Public RPCs remain SECURITY INVOKER wrappers; privileged work is internal.
-- The server, not the client, is authoritative for permission, tenancy, totals, and charge-line integrity.

create or replace function security_internal.create_preauthorization_atomic(p_payload jsonb, p_items jsonb, p_save_client_suggestion boolean default true)
returns public.pre_authorizations
language plpgsql security definer set search_path=''
as $function$
declare
  v_preauth public.pre_authorizations;
  v_item jsonb;
  v_fingerprint text;
  v_existing text;
  v_name text := trim(coalesce(p_payload->>'client_name',''));
  v_items jsonb := coalesce(p_items,'[]'::jsonb);
  v_facility uuid := nullif(p_payload->>'facility_id','')::uuid;
  v_total numeric := 0;
  v_qty numeric;
  v_unit numeric;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not security_internal.current_user_has_permission('preauth.write') then raise exception 'PERMISSION_DENIED' using errcode='42501'; end if;
  if v_facility is null then raise exception 'FACILITY_REQUIRED'; end if;
  if not security_internal.user_has_facility_access(v_facility) then raise exception 'FACILITY_ACCESS_DENIED' using errcode='42501'; end if;
  if v_name='' then raise exception 'CLIENT_NAME_REQUIRED'; end if;
  if trim(coalesce(p_payload->>'insurer_name',''))='' then raise exception 'INSURER_NAME_REQUIRED'; end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items)=0 then raise exception 'PREAUTH_ITEMS_REQUIRED'; end if;

  for v_item in select value from jsonb_array_elements(v_items) loop
    if trim(coalesce(v_item->>'description',''))='' then raise exception 'CHARGE_DESCRIPTION_REQUIRED'; end if;
    v_qty := coalesce((v_item->>'quantity')::numeric,0);
    v_unit := coalesce((v_item->>'unit_price')::numeric,0);
    if v_qty <= 0 or v_unit < 0 then raise exception 'INVALID_CHARGE_VALUE'; end if;
    v_total := v_total + round(v_qty*v_unit,2);
  end loop;
  if round(coalesce((p_payload->>'total_cost')::numeric,v_total),2) <> round(v_total,2) then raise exception 'TOTAL_COST_MISMATCH'; end if;

  v_fingerprint := public.pre_auth_complete_fingerprint(
    nullif(p_payload->>'patient_id','')::uuid,v_name,nullif(p_payload->>'client_date_of_birth','')::date,
    nullif(p_payload->>'client_identifier',''),nullif(p_payload->>'client_membership_number',''),
    nullif(p_payload->>'insurance_company_id','')::uuid,p_payload->>'insurer_name',p_payload->>'insurer_member_number',
    p_payload->>'insurer_plan_name',p_payload->>'insurer_policy_reference',nullif(p_payload->>'doctor_id','')::uuid,
    nullif(p_payload->>'procedure_id','')::uuid,nullif(p_payload->>'procedure_date','')::date,p_payload->>'diagnosis',
    v_total,v_items);

  select pa.request_number into v_existing from public.pre_authorizations pa
   where pa.facility_id=v_facility and pa.dedup_fingerprint=v_fingerprint
     and pa.created_at>=now()-interval '30 days' and lower(coalesce(pa.status,''))<>'rejected'
   order by pa.created_at desc limit 1;
  if v_existing is not null then raise exception 'DUPLICATE_PREAUTH: An equivalent pre-authorization already exists (request #%).',v_existing using errcode='23505',hint='Open the existing request before creating another one.'; end if;

  insert into public.pre_authorizations(patient_id,client_name,client_date_of_birth,client_phone,client_email,client_address,client_identifier,client_membership_number,doctor_id,procedure_id,diagnosis,procedure_date,insurance_company_id,insurer_name,insurer_member_number,insurer_plan_name,insurer_phone,insurer_email,insurer_policy_reference,provider_name,provider_address,provider_phone,total_cost,status,created_by,accommodation_days,clinical_notes,approval_notes,custom_diagnoses,diagnosis_ids,template_id,dedup_fingerprint,duplicate_checked_at,facility_id)
  values(nullif(p_payload->>'patient_id','')::uuid,v_name,nullif(p_payload->>'client_date_of_birth','')::date,nullif(p_payload->>'client_phone',''),nullif(p_payload->>'client_email',''),nullif(p_payload->>'client_address',''),nullif(p_payload->>'client_identifier',''),nullif(p_payload->>'client_membership_number',''),nullif(p_payload->>'doctor_id','')::uuid,nullif(p_payload->>'procedure_id','')::uuid,nullif(p_payload->>'diagnosis',''),nullif(p_payload->>'procedure_date','')::date,nullif(p_payload->>'insurance_company_id','')::uuid,trim(p_payload->>'insurer_name'),nullif(p_payload->>'insurer_member_number',''),nullif(p_payload->>'insurer_plan_name',''),nullif(p_payload->>'insurer_phone',''),nullif(p_payload->>'insurer_email',''),nullif(p_payload->>'insurer_policy_reference',''),nullif(p_payload->>'provider_name',''),nullif(p_payload->>'provider_address',''),nullif(p_payload->>'provider_phone',''),round(v_total,2),coalesce(nullif(p_payload->>'status',''),'pending'),(select auth.uid()),nullif(p_payload->>'accommodation_days','')::integer,nullif(p_payload->>'clinical_notes',''),nullif(p_payload->>'approval_notes',''),coalesce(p_payload->'custom_diagnoses','[]'::jsonb),coalesce(p_payload->'diagnosis_ids','[]'::jsonb),nullif(p_payload->>'template_id','')::uuid,v_fingerprint,now(),v_facility) returning * into v_preauth;

  for v_item in select value from jsonb_array_elements(v_items) loop
    v_qty := (v_item->>'quantity')::numeric;
    v_unit := (v_item->>'unit_price')::numeric;
    insert into public.preauth_items(preauth_id,description,quantity,unit_price,amount)
    values(v_preauth.id,trim(v_item->>'description'),v_qty::integer,v_unit,round(v_qty*v_unit,2));
  end loop;

  if p_save_client_suggestion then
    insert into public.preauth_client_suggestions(normalized_name,client_name,date_of_birth,phone,email,address,identifier,membership_number,source_patient_id,created_by,facility_id)
    values(public.normalize_preauth_client_name(v_name),v_name,nullif(p_payload->>'client_date_of_birth','')::date,nullif(p_payload->>'client_phone',''),nullif(p_payload->>'client_email',''),nullif(p_payload->>'client_address',''),nullif(p_payload->>'client_identifier',''),nullif(p_payload->>'client_membership_number',''),nullif(p_payload->>'patient_id','')::uuid,(select auth.uid()),v_facility)
    on conflict (normalized_name,coalesce(membership_number,''),coalesce(phone,'')) do update set
      client_name=excluded.client_name,date_of_birth=coalesce(excluded.date_of_birth,public.preauth_client_suggestions.date_of_birth),phone=coalesce(excluded.phone,public.preauth_client_suggestions.phone),email=coalesce(excluded.email,public.preauth_client_suggestions.email),address=coalesce(excluded.address,public.preauth_client_suggestions.address),identifier=coalesce(excluded.identifier,public.preauth_client_suggestions.identifier),membership_number=coalesce(excluded.membership_number,public.preauth_client_suggestions.membership_number),source_patient_id=coalesce(excluded.source_patient_id,public.preauth_client_suggestions.source_patient_id),use_count=public.preauth_client_suggestions.use_count+1,last_used_at=now(),updated_at=now();
  end if;
  return v_preauth;
end;
$function$;

create or replace function security_internal.update_preauthorization_atomic(p_preauth_id uuid,p_payload jsonb,p_items jsonb,p_reason text default 'amended')
returns public.pre_authorizations
language plpgsql security definer set search_path=''
as $function$
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
  update public.pre_authorizations set patient_id=nullif(p_payload->>'patient_id','')::uuid,client_name=coalesce(nullif(trim(p_payload->>'client_name'),''),v_row.client_name),client_date_of_birth=nullif(p_payload->>'client_date_of_birth','')::date,client_phone=nullif(p_payload->>'client_phone',''),client_email=nullif(p_payload->>'client_email',''),client_address=nullif(p_payload->>'client_address',''),client_identifier=nullif(p_payload->>'client_identifier',''),client_membership_number=nullif(p_payload->>'client_membership_number',''),doctor_id=nullif(p_payload->>'doctor_id','')::uuid,procedure_id=nullif(p_payload->>'procedure_id','')::uuid,diagnosis=nullif(p_payload->>'diagnosis',''),procedure_date=nullif(p_payload->>'procedure_date','')::date,insurance_company_id=nullif(p_payload->>'insurance_company_id','')::uuid,insurer_name=coalesce(nullif(trim(p_payload->>'insurer_name'),''),v_row.insurer_name),insurer_member_number=nullif(p_payload->>'insurer_member_number',''),insurer_plan_name=nullif(p_payload->>'insurer_plan_name',''),insurer_phone=nullif(p_payload->>'insurer_phone',''),insurer_email=nullif(p_payload->>'insurer_email',''),insurer_policy_reference=nullif(p_payload->>'insurer_policy_reference',''),provider_name=nullif(p_payload->>'provider_name',''),provider_address=nullif(p_payload->>'provider_address',''),provider_phone=nullif(p_payload->>'provider_phone',''),total_cost=round(v_total,2),status=coalesce(nullif(p_payload->>'status',''),v_row.status),accommodation_days=nullif(p_payload->>'accommodation_days','')::integer,clinical_notes=nullif(p_payload->>'clinical_notes',''),approval_notes=nullif(p_payload->>'approval_notes',''),custom_diagnoses=coalesce(p_payload->'custom_diagnoses','[]'::jsonb),diagnosis_ids=coalesce(p_payload->'diagnosis_ids','[]'::jsonb),template_id=nullif(p_payload->>'template_id','')::uuid,dedup_fingerprint=v_fp,duplicate_checked_at=now() where id=p_preauth_id returning * into v_row;
  delete from public.preauth_items where preauth_id=p_preauth_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::numeric; v_unit := (v_item->>'unit_price')::numeric;
    insert into public.preauth_items(preauth_id,description,quantity,unit_price,amount) values(p_preauth_id,trim(v_item->>'description'),v_qty::integer,v_unit,round(v_qty*v_unit,2));
  end loop;
  return v_row;
end;
$function$;

revoke all on function security_internal.create_preauthorization_atomic(jsonb,jsonb,boolean) from public,anon;
revoke all on function security_internal.update_preauthorization_atomic(uuid,jsonb,jsonb,text) from public,anon;
grant execute on function security_internal.create_preauthorization_atomic(jsonb,jsonb,boolean) to authenticated;
grant execute on function security_internal.update_preauthorization_atomic(uuid,jsonb,jsonb,text) to authenticated;

create or replace function public.create_preauthorization_atomic(p_payload jsonb,p_items jsonb,p_save_client_suggestion boolean default true)
returns public.pre_authorizations language sql security invoker set search_path='' as $$ select security_internal.create_preauthorization_atomic(p_payload,p_items,p_save_client_suggestion); $$;
create or replace function public.update_preauthorization_atomic(p_preauth_id uuid,p_payload jsonb,p_items jsonb,p_reason text default 'amended')
returns public.pre_authorizations language sql security invoker set search_path='' as $$ select security_internal.update_preauthorization_atomic(p_preauth_id,p_payload,p_items,p_reason); $$;
revoke all on function public.create_preauthorization_atomic(jsonb,jsonb,boolean) from public,anon;
revoke all on function public.update_preauthorization_atomic(uuid,jsonb,jsonb,text) from public,anon;
grant execute on function public.create_preauthorization_atomic(jsonb,jsonb,boolean) to authenticated;
grant execute on function public.update_preauthorization_atomic(uuid,jsonb,jsonb,text) to authenticated;
