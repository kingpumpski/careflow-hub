-- Final definition is intentionally DROP + CREATE so this migration remains
-- deterministic even when an earlier amendment migration was skipped.
DROP FUNCTION IF EXISTS public.update_preauthorization_atomic(UUID,JSONB,JSONB,TEXT);

CREATE FUNCTION public.update_preauthorization_atomic(
  p_preauth_id UUID,
  p_payload JSONB,
  p_items JSONB,
  p_reason TEXT DEFAULT 'amended'
)
RETURNS public.pre_authorizations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row public.pre_authorizations;
  v_item JSONB;
  v_total NUMERIC;
  v_fp TEXT;
  v_existing UUID;
  v_facility UUID;
BEGIN
  IF (select auth.uid()) IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_row FROM public.pre_authorizations WHERE id=p_preauth_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PREAUTH_NOT_FOUND'; END IF;
  v_facility := v_row.facility_id;
  IF v_facility IS NULL THEN RAISE EXCEPTION 'FACILITY_REQUIRED'; END IF;
  IF NOT public.user_has_facility_access(v_facility) THEN RAISE EXCEPTION 'FACILITY_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF trim(coalesce(p_payload->>'client_name',v_row.client_name,''))='' THEN RAISE EXCEPTION 'CLIENT_NAME_REQUIRED'; END IF;
  IF trim(coalesce(p_payload->>'insurer_name',v_row.insurer_name,''))='' THEN RAISE EXCEPTION 'INSURER_NAME_REQUIRED'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_facility::text || ':' || p_preauth_id::text,0));
  v_total := public.preauth_validate_items(p_items);
  IF round(coalesce((p_payload->>'total_cost')::numeric,v_total),2) <> v_total THEN RAISE EXCEPTION 'TOTAL_COST_MISMATCH'; END IF;

  v_fp := public.preauth_complete_fingerprint(jsonb_set(coalesce(p_payload,'{}'::jsonb),'{facility_id}',to_jsonb(v_facility::text),true),p_items);
  SELECT id INTO v_existing FROM public.pre_authorizations
  WHERE facility_id=v_facility AND dedup_fingerprint=v_fp AND id<>p_preauth_id
    AND created_at >= now()-interval '30 days' AND lower(coalesce(status,'')) <> 'rejected'
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF v_existing IS NOT NULL THEN RAISE EXCEPTION 'DUPLICATE_PREAUTH:%',v_existing USING ERRCODE='23505'; END IF;

  UPDATE public.pre_authorizations SET
    patient_id=NULLIF(p_payload->>'patient_id','')::uuid,
    client_name=coalesce(NULLIF(trim(p_payload->>'client_name'),''),v_row.client_name),
    client_date_of_birth=NULLIF(p_payload->>'client_date_of_birth','')::date, client_phone=NULLIF(p_payload->>'client_phone',''), client_email=NULLIF(p_payload->>'client_email',''), client_address=NULLIF(p_payload->>'client_address',''), client_identifier=NULLIF(p_payload->>'client_identifier',''), client_membership_number=NULLIF(p_payload->>'client_membership_number',''),
    doctor_id=NULLIF(p_payload->>'doctor_id','')::uuid, procedure_id=NULLIF(p_payload->>'procedure_id','')::uuid, diagnosis=NULLIF(p_payload->>'diagnosis',''), procedure_date=NULLIF(p_payload->>'procedure_date','')::date,
    insurance_company_id=NULLIF(p_payload->>'insurance_company_id','')::uuid, insurer_name=coalesce(NULLIF(trim(p_payload->>'insurer_name'),''),v_row.insurer_name), insurer_member_number=NULLIF(p_payload->>'insurer_member_number',''), insurer_plan_name=NULLIF(p_payload->>'insurer_plan_name',''), insurer_phone=NULLIF(p_payload->>'insurer_phone',''), insurer_email=NULLIF(p_payload->>'insurer_email',''), insurer_policy_reference=NULLIF(p_payload->>'insurer_policy_reference',''),
    provider_name=NULLIF(p_payload->>'provider_name',''), provider_address=NULLIF(p_payload->>'provider_address',''), provider_phone=NULLIF(p_payload->>'provider_phone',''), total_cost=v_total,
    status=coalesce(NULLIF(p_payload->>'status',''),'amended'), accommodation_days=NULLIF(p_payload->>'accommodation_days','')::integer, clinical_notes=NULLIF(p_payload->>'clinical_notes',''), approval_notes=NULLIF(p_payload->>'approval_notes',''), custom_diagnoses=coalesce(p_payload->'custom_diagnoses','[]'::jsonb), diagnosis_ids=coalesce(p_payload->'diagnosis_ids','[]'::jsonb), template_id=NULLIF(p_payload->>'template_id','')::uuid,
    dedup_fingerprint=v_fp, duplicate_checked_at=now()
  WHERE id=p_preauth_id RETURNING * INTO v_row;

  DELETE FROM public.preauth_items WHERE preauth_id=p_preauth_id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.preauth_items(preauth_id,description,quantity,unit_price,amount)
    VALUES(p_preauth_id,trim(v_item->>'description'),(v_item->>'quantity')::numeric,(v_item->>'unit_price')::numeric,round((v_item->>'quantity')::numeric*(v_item->>'unit_price')::numeric,2));
  END LOOP;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_preauthorization_atomic(UUID,JSONB,JSONB,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_preauthorization_atomic(UUID,JSONB,JSONB,TEXT) TO authenticated;
