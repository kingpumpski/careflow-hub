-- The text-first trigger introduced earlier cannot see cost lines because the
-- legacy UI writes them after the parent row. The atomic studio is now the
-- authoritative creation boundary, so duplicate checking happens with the
-- complete request including charge lines.
DROP TRIGGER IF EXISTS trg_guard_duplicate_preauthorization ON public.pre_authorizations;

CREATE OR REPLACE FUNCTION public.preauth_complete_fingerprint(
  p_patient_id UUID, p_client_name TEXT, p_client_date_of_birth DATE,
  p_client_identifier TEXT, p_client_membership_number TEXT,
  p_insurance_company_id UUID, p_insurer_name TEXT, p_insurer_member_number TEXT,
  p_insurer_plan_name TEXT, p_insurer_policy_reference TEXT,
  p_doctor_id UUID, p_procedure_id UUID, p_procedure_date DATE,
  p_diagnosis TEXT, p_total_cost NUMERIC, p_items JSONB
)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT md5(jsonb_build_object(
    'patient_id', p_patient_id,
    'client_name', public.normalize_preauth_client_name(p_client_name),
    'client_date_of_birth', p_client_date_of_birth,
    'client_identifier', lower(trim(coalesce(p_client_identifier,''))),
    'client_membership_number', lower(trim(coalesce(p_client_membership_number,''))),
    'insurance_company_id', p_insurance_company_id,
    'insurer_name', lower(regexp_replace(trim(coalesce(p_insurer_name,'')), '\s+', ' ', 'g')),
    'insurer_member_number', lower(trim(coalesce(p_insurer_member_number,''))),
    'insurer_plan_name', lower(regexp_replace(trim(coalesce(p_insurer_plan_name,'')), '\s+', ' ', 'g')),
    'insurer_policy_reference', lower(trim(coalesce(p_insurer_policy_reference,''))),
    'doctor_id', p_doctor_id, 'procedure_id', p_procedure_id,
    'procedure_date', p_procedure_date,
    'diagnosis', lower(regexp_replace(trim(coalesce(p_diagnosis,'')), '\s+', ' ', 'g')),
    'total_cost', round(coalesce(p_total_cost,0),2),
    'items', coalesce(p_items,'[]'::jsonb)
  )::text);
$$;

CREATE OR REPLACE FUNCTION public.create_preauthorization_atomic(
  p_payload JSONB, p_items JSONB, p_save_client_suggestion BOOLEAN DEFAULT TRUE
)
RETURNS public.pre_authorizations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_preauth public.pre_authorizations;
  v_item JSONB;
  v_fingerprint TEXT;
  v_existing BIGINT;
  v_name TEXT := trim(coalesce(p_payload->>'client_name',''));
  v_items JSONB := coalesce(p_items,'[]'::jsonb);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'Client name is required'; END IF;
  IF trim(coalesce(p_payload->>'insurer_name','')) = '' THEN RAISE EXCEPTION 'Insurer name is required'; END IF;

  v_fingerprint := public.preauth_complete_fingerprint(
    NULLIF(p_payload->>'patient_id','')::UUID, v_name,
    NULLIF(p_payload->>'client_date_of_birth','')::DATE,
    NULLIF(p_payload->>'client_identifier',''), NULLIF(p_payload->>'client_membership_number',''),
    NULLIF(p_payload->>'insurance_company_id','')::UUID,
    p_payload->>'insurer_name', p_payload->>'insurer_member_number',
    p_payload->>'insurer_plan_name', p_payload->>'insurer_policy_reference',
    NULLIF(p_payload->>'doctor_id','')::UUID, NULLIF(p_payload->>'procedure_id','')::UUID,
    NULLIF(p_payload->>'procedure_date','')::DATE, p_payload->>'diagnosis',
    NULLIF(p_payload->>'total_cost','')::NUMERIC, v_items);

  SELECT pa.request_number INTO v_existing
  FROM public.pre_authorizations pa
  WHERE pa.dedup_fingerprint = v_fingerprint
    AND pa.created_at >= now() - interval '30 days'
    AND lower(coalesce(pa.status,'')) <> 'rejected'
  ORDER BY pa.created_at DESC LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICATE_PREAUTH: An equivalent pre-authorization already exists (request #%).', v_existing
      USING ERRCODE='23505', HINT='Open the existing request before creating another one.';
  END IF;

  INSERT INTO public.pre_authorizations (
    patient_id, client_name, client_date_of_birth, client_phone, client_email,
    client_address, client_identifier, client_membership_number, doctor_id, procedure_id,
    diagnosis, procedure_date, insurance_company_id, insurer_name, insurer_member_number,
    insurer_plan_name, insurer_phone, insurer_email, insurer_policy_reference,
    provider_name, provider_address, provider_phone, total_cost, status, created_by,
    accommodation_days, clinical_notes, approval_notes, custom_diagnoses, diagnosis_ids,
    template_id, dedup_fingerprint, duplicate_checked_at
  ) VALUES (
    NULLIF(p_payload->>'patient_id','')::UUID, v_name,
    NULLIF(p_payload->>'client_date_of_birth','')::DATE,
    NULLIF(p_payload->>'client_phone',''), NULLIF(p_payload->>'client_email',''),
    NULLIF(p_payload->>'client_address',''), NULLIF(p_payload->>'client_identifier',''),
    NULLIF(p_payload->>'client_membership_number',''),
    NULLIF(p_payload->>'doctor_id','')::UUID, NULLIF(p_payload->>'procedure_id','')::UUID,
    NULLIF(p_payload->>'diagnosis',''), NULLIF(p_payload->>'procedure_date','')::DATE,
    NULLIF(p_payload->>'insurance_company_id','')::UUID, trim(p_payload->>'insurer_name'),
    NULLIF(p_payload->>'insurer_member_number',''), NULLIF(p_payload->>'insurer_plan_name',''),
    NULLIF(p_payload->>'insurer_phone',''), NULLIF(p_payload->>'insurer_email',''),
    NULLIF(p_payload->>'insurer_policy_reference',''), NULLIF(p_payload->>'provider_name',''),
    NULLIF(p_payload->>'provider_address',''), NULLIF(p_payload->>'provider_phone',''),
    coalesce(NULLIF(p_payload->>'total_cost','')::NUMERIC,0),
    coalesce(NULLIF(p_payload->>'status',''),'pending'), auth.uid(),
    NULLIF(p_payload->>'accommodation_days','')::INTEGER, NULLIF(p_payload->>'clinical_notes',''),
    NULLIF(p_payload->>'approval_notes',''), coalesce(p_payload->'custom_diagnoses','[]'::jsonb),
    coalesce(p_payload->'diagnosis_ids','[]'::jsonb), NULLIF(p_payload->>'template_id','')::UUID,
    v_fingerprint, now()
  ) RETURNING * INTO v_preauth;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    INSERT INTO public.preauth_items(preauth_id,description,quantity,unit_price,amount)
    VALUES (v_preauth.id, trim(v_item->>'description'),
      greatest(1,coalesce((v_item->>'quantity')::INTEGER,1)),
      greatest(0,coalesce((v_item->>'unit_price')::NUMERIC,0)),
      greatest(0,coalesce((v_item->>'amount')::NUMERIC,0)));
  END LOOP;

  IF p_save_client_suggestion THEN
    INSERT INTO public.preauth_client_suggestions
      (normalized_name,client_name,date_of_birth,phone,email,address,identifier,membership_number,source_patient_id,created_by)
    VALUES (public.normalize_preauth_client_name(v_name),v_name,
      NULLIF(p_payload->>'client_date_of_birth','')::DATE,NULLIF(p_payload->>'client_phone',''),
      NULLIF(p_payload->>'client_email',''),NULLIF(p_payload->>'client_address',''),
      NULLIF(p_payload->>'client_identifier',''),NULLIF(p_payload->>'client_membership_number',''),
      NULLIF(p_payload->>'patient_id','')::UUID,auth.uid())
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_preauth;
END;
$$;
REVOKE ALL ON FUNCTION public.create_preauthorization_atomic(JSONB,JSONB,BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_preauthorization_atomic(JSONB,JSONB,BOOLEAN) TO authenticated;
