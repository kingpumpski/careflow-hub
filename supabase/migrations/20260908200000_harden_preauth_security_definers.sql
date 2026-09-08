-- Keep privileged pre-authorization operations behind a non-exposed schema.
-- Public RPC names remain stable through SECURITY INVOKER wrappers.

create schema if not exists security_internal;
revoke all on schema security_internal from public;
grant usage on schema security_internal to authenticated;

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
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if v_name='' then raise exception 'Client name is required'; end if;
  if trim(coalesce(p_payload->>'insurer_name',''))='' then raise exception 'Insurer name is required'; end if;
  v_fingerprint := public.pre_auth_complete_fingerprint(nullif(p_payload->>'patient_id','')::uuid,v_name,nullif(p_payload->>'client_date_of_birth','')::date,nullif(p_payload->>'client_identifier',''),nullif(p_payload->>'client_membership_number',''),nullif(p_payload->>'insurance_company_id','')::uuid,p_payload->>'insurer_name',p_payload->>'insurer_member_number',p_payload->>'insurer_plan_name',p_payload->>'insurer_policy_reference',nullif(p_payload->>'doctor_id','')::uuid,nullif(p_payload->>'procedure_id','')::uuid,nullif(p_payload->>'procedure_date','')::date,p_payload->>'diagnosis',nullif(p_payload->>'total_cost','')::numeric,v_items);
  select pa.request_number into v_existing from public.pre_authorizations pa where pa.dedup_fingerprint=v_fingerprint and pa.created_at>=now()-interval '30 days' and lower(coalesce(pa.status,''))<>'rejected' order by pa.created_at desc limit 1;
  if v_existing is not null then raise exception 'DUPLICATE_PREAUTH: An equivalent pre-authorization already exists (request #%).',v_existing using errcode='23505',hint='Open the existing request before creating another one.'; end if;
  insert into public.pre_authorizations(patient_id,client_name,client_date_of_birth,client_phone,client_email,client_address,client_identifier,client_membership_number,doctor_id,procedure_id,diagnosis,procedure_date,insurance_company_id,insurer_name,insurer_member_number,insurer_plan_name,insurer_phone,insurer_email,insurer_policy_reference,provider_name,provider_address,provider_phone,total_cost,status,created_by,accommodation_days,clinical_notes,approval_notes,custom_diagnoses,diagnosis_ids,template_id,dedup_fingerprint,duplicate_checked_at)
  values(nullif(p_payload->>'patient_id','')::uuid,v_name,nullif(p_payload->>'client_date_of_birth','')::date,nullif(p_payload->>'client_phone',''),nullif(p_payload->>'client_email',''),nullif(p_payload->>'client_address',''),nullif(p_payload->>'client_identifier',''),nullif(p_payload->>'client_membership_number',''),nullif(p_payload->>'doctor_id','')::uuid,nullif(p_payload->>'procedure_id','')::uuid,nullif(p_payload->>'diagnosis',''),nullif(p_payload->>'procedure_date','')::date,nullif(p_payload->>'insurance_company_id','')::uuid,trim(p_payload->>'insurer_name'),nullif(p_payload->>'insurer_member_number',''),nullif(p_payload->>'insurer_plan_name',''),nullif(p_payload->>'insurer_phone',''),nullif(p_payload->>'insurer_email',''),nullif(p_payload->>'insurer_policy_reference',''),nullif(p_payload->>'provider_name',''),nullif(p_payload->>'provider_address',''),nullif(p_payload->>'provider_phone',''),coalesce(nullif(p_payload->>'total_cost','')::numeric,0),coalesce(nullif(p_payload->>'status',''),'pending'),(select auth.uid()),nullif(p_payload->>'accommodation_days','')::integer,nullif(p_payload->>'clinical_notes',''),nullif(p_payload->>'approval_notes',''),coalesce(p_payload->'custom_diagnoses','[]'::jsonb),coalesce(p_payload->'diagnosis_ids','[]'::jsonb),nullif(p_payload->>'template_id','')::uuid,v_fingerprint,now()) returning * into v_preauth;
  for v_item in select value from jsonb_array_elements(v_items) loop
    insert into public.preauth_items(preauth_id,description,quantity,unit_price,amount) values(v_preauth.id,trim(v_item->>'description'),greatest(1,coalesce((v_item->>'quantity')::integer,1)),greatest(0,coalesce((v_item->>'unit_price')::numeric,0)),greatest(0,coalesce((v_item->>'amount')::numeric,0)));
  end loop;
  if p_save_client_suggestion then
    insert into public.preauth_client_suggestions(normalized_name,client_name,date_of_birth,phone,email,address,identifier,membership_number,source_patient_id,created_by) values(public.normalize_preauth_client_name(v_name),v_name,nullif(p_payload->>'client_date_of_birth','')::date,nullif(p_payload->>'client_phone',''),nullif(p_payload->>'client_email',''),nullif(p_payload->>'client_address',''),nullif(p_payload->>'client_identifier',''),nullif(p_payload->>'client_membership_number',''),nullif(p_payload->>'patient_id','')::uuid,(select auth.uid())) on conflict do nothing;
  end if;
  return v_preauth;
end;
$function$;

create or replace function security_internal.find_duplicate_preauthorization(p_patient_id uuid,p_insurance_company_id uuid,p_doctor_id uuid,p_procedure_id uuid,p_procedure_date date,p_diagnosis text,p_items jsonb,p_exclude_id uuid default null)
returns table(id uuid,request_number text,status text,current_state text,created_at timestamptz,total_cost numeric,patient_id uuid)
language sql stable security definer set search_path=''
as $$
  with candidate as (select public.build_preauth_dedup_fingerprint(p_patient_id,p_insurance_company_id,p_doctor_id,p_procedure_id,p_procedure_date,p_diagnosis,p_items) fingerprint)
  select pa.id,pa.request_number,pa.status,pa.current_state,pa.created_at,pa.total_cost,pa.patient_id from public.pre_authorizations pa,candidate c where pa.dedup_fingerprint=c.fingerprint and pa.id is distinct from p_exclude_id and pa.created_at>=now()-interval '30 days' and lower(coalesce(pa.status,''))<>'rejected' order by pa.created_at desc limit 1;
$$;

create or replace function security_internal.preauth_snapshot(p_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_header jsonb; v_items jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select to_jsonb(p)-'created_by' into v_header from public.pre_authorizations p where p.id=p_id;
  if v_header is null then raise exception 'Pre-authorization not found' using errcode='P0002'; end if;
  select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb) into v_items from public.preauth_items i where i.preauth_id=p_id;
  return jsonb_build_object('request',v_header,'items',v_items);
end;
$function$;

create or replace function security_internal.set_preauth_request_number()
returns trigger language plpgsql security definer set search_path='public'
as $function$
begin
  if new.request_number is null or btrim(new.request_number)='' then new.request_number := 'PA-' || extract(year from coalesce(new.created_at,now()))::text || '-' || upper(substring(replace(new.id::text,'-','') from 1 for 8)); end if;
  return new;
end;
$function$;

drop trigger if exists trg_assign_preauth_request_number on public.pre_authorizations;
drop trigger if exists trg_set_preauth_request_number on public.pre_authorizations;
create trigger trg_set_preauth_request_number before insert on public.pre_authorizations for each row execute function security_internal.set_preauth_request_number();

drop function if exists public.assign_preauth_request_number();
drop function if exists public.set_preauth_request_number();

revoke execute on function security_internal.create_preauthorization_atomic(jsonb,jsonb,boolean) from public,anon;
revoke execute on function security_internal.find_duplicate_preauthorization(uuid,uuid,uuid,uuid,date,text,jsonb,uuid) from public,anon;
revoke execute on function security_internal.preauth_snapshot(uuid) from public,anon;
grant execute on function security_internal.create_preauthorization_atomic(jsonb,jsonb,boolean) to authenticated;
grant execute on function security_internal.find_duplicate_preauthorization(uuid,uuid,uuid,uuid,date,text,jsonb,uuid) to authenticated;
grant execute on function security_internal.preauth_snapshot(uuid) to authenticated;

create or replace function public.create_preauthorization_atomic(p_payload jsonb,p_items jsonb,p_save_client_suggestion boolean default true)
returns public.pre_authorizations language sql security invoker set search_path=''
as $$ select security_internal.create_preauthorization_atomic(p_payload,p_items,p_save_client_suggestion); $$;
create or replace function public.find_duplicate_preauthorization(p_patient_id uuid,p_insurance_company_id uuid,p_doctor_id uuid,p_procedure_id uuid,p_procedure_date date,p_diagnosis text,p_items jsonb,p_exclude_id uuid default null)
returns table(id uuid,request_number text,status text,current_state text,created_at timestamptz,total_cost numeric,patient_id uuid) language sql stable security invoker set search_path=''
as $$ select * from security_internal.find_duplicate_preauthorization($1,$2,$3,$4,$5,$6,$7,$8); $$;
create or replace function public.preauth_snapshot(p_id uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select security_internal.preauth_snapshot(p_id); $$;

revoke execute on function public.create_preauthorization_atomic(jsonb,jsonb,boolean) from anon;
revoke execute on function public.find_duplicate_preauthorization(uuid,uuid,uuid,uuid,date,text,jsonb,uuid) from anon;
revoke execute on function public.preauth_snapshot(uuid) from anon;

create or replace function security_internal.guard_duplicate_preauthorization()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare fingerprint text; existing_request text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='42501'; end if;
  fingerprint := public.build_preauth_text_identity_fingerprint(new.patient_id,new.client_name,new.client_date_of_birth,new.client_identifier,new.client_membership_number,new.insurance_company_id,new.insurer_name,new.insurer_member_number,new.insurer_plan_name,new.insurer_policy_reference,new.doctor_id,new.procedure_id,new.procedure_date,new.diagnosis,new.total_cost);
  select pa.request_number into existing_request from public.pre_authorizations pa where pa.dedup_fingerprint=fingerprint and pa.created_at>=now()-interval '30 days' and lower(coalesce(pa.status,''))<>'rejected' order by pa.created_at desc limit 1;
  if existing_request is not null then raise exception 'DUPLICATE_PREAUTH: An equivalent pre-authorization already exists (request #%).',existing_request using errcode='23505',hint='Open the existing request or materially change the request details before creating another one.'; end if;
  new.dedup_fingerprint:=fingerprint; new.duplicate_checked_at:=now(); return new;
end;
$function$;
revoke all on function security_internal.guard_duplicate_preauthorization() from public,anon,authenticated;

-- The privileged trigger guard is intentionally database-internal; application writes use the atomic RPC/RLS boundary.
