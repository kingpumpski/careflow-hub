-- Scope reusable pre-authorization client suggestions to a facility.
-- The same client identity may legitimately exist in different facilities.
DROP INDEX IF EXISTS public.preauth_client_suggestions_identity_unique;
CREATE UNIQUE INDEX IF NOT EXISTS preauth_client_suggestions_facility_identity_unique
ON public.preauth_client_suggestions (
  facility_id,
  normalized_name,
  COALESCE(membership_number, ''),
  COALESCE(phone, '')
);

-- Keep the atomic writer aligned with the facility-scoped conflict target.
-- Authorization, facility tenancy, duplicate detection, and server-side total
-- validation are enforced in this SECURITY DEFINER implementation; the public
-- function remains a SECURITY INVOKER wrapper.
CREATE OR REPLACE FUNCTION security_internal.create_preauthorization_atomic(
  p_payload jsonb,
  p_items jsonb,
  p_save_client_suggestion boolean DEFAULT true
)
RETURNS public.pre_authorizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
    nullif(p_payload->>'patient_id','')::uuid,
    v_name,
    nullif(p_payload->>'client_date_of_birth','')::date,
    nullif(p_payload->>'client_identifier',''),
    nullif(p_payload->>'client_membership_number',''),
    nullif(p_payload->>'insurance_company_id','')::uuid,
    p_payload->>'insurer_name',
    p_payload->>'insurer_member_number',
    p_payload->>'insurer_plan_name',
    p_payload->>'insurer_policy_reference',
    nullif(p_payload->>'doctor_id','')::uuid,
    nullif(p_payload->>'procedure_id','')::uuid,
    nullif(p_payload->>'procedure_date','')::date,
    p_payload->>'diagnosis',
    v_total,
    v_items
  );

  select pa.request_number into v_existing
  from public.pre_authorizations pa
  where pa.facility_id=v_facility
    and pa.dedup_fingerprint=v_fingerprint
    and pa.created_at>=now()-interval '30 days'
    and lower(coalesce(pa.status,''))<>'rejected'
  order by pa.created_at desc
  limit 1;
  if v_existing is not null then
    raise exception 'DUPLICATE_PREAUTH: An equivalent pre-authorization already exists (request #%).',v_existing
      using errcode='23505',hint='Open the existing request before creating another one.';
  end if;

  insert into public.pre_authorizations(
    patient_id,client_name,client_date_of_birth,client_phone,client_email,client_address,
    client_identifier,client_membership_number,doctor_id,procedure_id,diagnosis,procedure_date,
    insurance_company_id,insurer_name,insurer_member_number,insurer_plan_name,insurer_phone,
    insurer_email,insurer_policy_reference,provider_name,provider_address,provider_phone,total_cost,
    status,created_by,accommodation_days,clinical_notes,approval_notes,custom_diagnoses,diagnosis_ids,
    template_id,dedup_fingerprint,duplicate_checked_at,facility_id
  )
  values(
    nullif(p_payload->>'patient_id','')::uuid,v_name,nullif(p_payload->>'client_date_of_birth','')::date,
    nullif(p_payload->>'client_phone',''),nullif(p_payload->>'client_email',''),nullif(p_payload->>'client_address',''),
    nullif(p_payload->>'client_identifier',''),nullif(p_payload->>'client_membership_number',''),
    nullif(p_payload->>'doctor_id','')::uuid,nullif(p_payload->>'procedure_id','')::uuid,nullif(p_payload->>'diagnosis',''),
    nullif(p_payload->>'procedure_date','')::date,nullif(p_payload->>'insurance_company_id','')::uuid,
    trim(p_payload->>'insurer_name'),nullif(p_payload->>'insurer_member_number',''),nullif(p_payload->>'insurer_plan_name',''),
    nullif(p_payload->>'insurer_phone',''),nullif(p_payload->>'insurer_email',''),nullif(p_payload->>'insurer_policy_reference',''),
    nullif(p_payload->>'provider_name',''),nullif(p_payload->>'provider_address',''),nullif(p_payload->>'provider_phone',''),
    round(v_total,2),coalesce(nullif(p_payload->>'status',''),'pending'),(select auth.uid()),
    nullif(p_payload->>'accommodation_days','')::integer,nullif(p_payload->>'clinical_notes',''),
    nullif(p_payload->>'approval_notes',''),coalesce(p_payload->'custom_diagnoses','[]'::jsonb),
    coalesce(p_payload->'diagnosis_ids','[]'::jsonb),nullif(p_payload->>'template_id','')::uuid,
    v_fingerprint,now(),v_facility
  ) returning * into v_preauth;

  for v_item in select value from jsonb_array_elements(v_items) loop
    v_qty := (v_item->>'quantity')::numeric;
    v_unit := (v_item->>'unit_price')::numeric;
    insert into public.preauth_items(preauth_id,description,quantity,unit_price,amount)
    values(v_preauth.id,trim(v_item->>'description'),v_qty::integer,v_unit,round(v_qty*v_unit,2));
  end loop;

  if p_save_client_suggestion then
    insert into public.preauth_client_suggestions(
      normalized_name,client_name,date_of_birth,phone,email,address,identifier,
      membership_number,source_patient_id,created_by,facility_id
    )
    values(
      public.normalize_preauth_client_name(v_name),v_name,
      nullif(p_payload->>'client_date_of_birth','')::date,nullif(p_payload->>'client_phone',''),
      nullif(p_payload->>'client_email',''),nullif(p_payload->>'client_address',''),
      nullif(p_payload->>'client_identifier',''),nullif(p_payload->>'client_membership_number',''),
      nullif(p_payload->>'patient_id','')::uuid,(select auth.uid()),v_facility
    )
    on conflict (facility_id,normalized_name,coalesce(membership_number,''),coalesce(phone,''))
    do update set
      client_name=excluded.client_name,
      date_of_birth=coalesce(excluded.date_of_birth,public.preauth_client_suggestions.date_of_birth),
      phone=coalesce(excluded.phone,public.preauth_client_suggestions.phone),
      email=coalesce(excluded.email,public.preauth_client_suggestions.email),
      address=coalesce(excluded.address,public.preauth_client_suggestions.address),
      identifier=coalesce(excluded.identifier,public.preauth_client_suggestions.identifier),
      membership_number=coalesce(excluded.membership_number,public.preauth_client_suggestions.membership_number),
      source_patient_id=coalesce(excluded.source_patient_id,public.preauth_client_suggestions.source_patient_id),
      use_count=public.preauth_client_suggestions.use_count+1,
      last_used_at=now(),updated_at=now();
  end if;
  return v_preauth;
end;
$$;
