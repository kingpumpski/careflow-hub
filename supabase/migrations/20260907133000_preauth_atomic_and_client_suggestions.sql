-- Text-first Pre-Authorization: reusable client suggestions + atomic request creation.
CREATE TABLE IF NOT EXISTS public.preauth_client_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_name TEXT NOT NULL,
  client_name TEXT NOT NULL,
  date_of_birth DATE,
  phone TEXT,
  email TEXT,
  address TEXT,
  identifier TEXT,
  membership_number TEXT,
  source_patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  use_count INTEGER NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS preauth_client_suggestions_name_idx ON public.preauth_client_suggestions(normalized_name);
CREATE INDEX IF NOT EXISTS preauth_client_suggestions_recent_idx ON public.preauth_client_suggestions(last_used_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS preauth_client_suggestions_identity_idx ON public.preauth_client_suggestions(normalized_name, COALESCE(membership_number,''), COALESCE(phone,''));
ALTER TABLE public.preauth_client_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS preauth_client_suggestions_select ON public.preauth_client_suggestions;
CREATE POLICY preauth_client_suggestions_select ON public.preauth_client_suggestions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS preauth_client_suggestions_insert ON public.preauth_client_suggestions;
CREATE POLICY preauth_client_suggestions_insert ON public.preauth_client_suggestions FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS preauth_client_suggestions_update ON public.preauth_client_suggestions;
CREATE POLICY preauth_client_suggestions_update ON public.preauth_client_suggestions FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.normalize_preauth_client_name(p_name TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT lower(regexp_replace(trim(coalesce(p_name,'')), '\\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.preauth_complete_fingerprint(p_payload JSONB, p_items JSONB)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT md5(jsonb_build_object(
    'patient_id', p_payload->>'patient_id',
    'client_name', public.normalize_preauth_client_name(p_payload->>'client_name'),
    'dob', p_payload->>'client_date_of_birth',
    'identifier', lower(trim(coalesce(p_payload->>'client_identifier',''))),
    'membership', lower(trim(coalesce(p_payload->>'client_membership_number',''))),
    'insurance_id', p_payload->>'insurance_company_id',
    'insurer', lower(regexp_replace(trim(coalesce(p_payload->>'insurer_name','')), '\\s+', ' ', 'g')),
    'member', lower(trim(coalesce(p_payload->>'insurer_member_number',''))),
    'plan', lower(regexp_replace(trim(coalesce(p_payload->>'insurer_plan_name','')), '\\s+', ' ', 'g')),
    'policy', lower(trim(coalesce(p_payload->>'insurer_policy_reference',''))),
    'doctor_id', p_payload->>'doctor_id',
    'procedure_id', p_payload->>'procedure_id',
    'procedure_date', p_payload->>'procedure_date',
    'diagnosis', lower(regexp_replace(trim(coalesce(p_payload->>'diagnosis','')), '\\s+', ' ', 'g')),
    'total', round(coalesce((p_payload->>'total_cost')::numeric,0),2),
    'items', coalesce(p_items,'[]'::jsonb)
  )::text);
$$;

CREATE OR REPLACE FUNCTION public.create_preauthorization_atomic(p_payload JSONB, p_items JSONB, p_save_client_suggestion BOOLEAN DEFAULT TRUE)
RETURNS public.pre_authorizations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.pre_authorizations; v_item JSONB; v_fp TEXT; v_existing UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF trim(coalesce(p_payload->>'client_name','')) = '' THEN RAISE EXCEPTION 'Client name is required'; END IF;
  IF trim(coalesce(p_payload->>'insurer_name','')) = '' THEN RAISE EXCEPTION 'Insurer name is required'; END IF;
  IF jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'At least one charge line is required'; END IF;

  v_fp := public.preauth_complete_fingerprint(p_payload,p_items);
  SELECT id INTO v_existing FROM public.pre_authorizations
   WHERE dedup_fingerprint=v_fp AND id IS NOT NULL
     AND created_at >= now()-interval '30 days'
     AND lower(coalesce(status,'')) <> 'rejected'
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF v_existing IS NOT NULL THEN RAISE EXCEPTION 'DUPLICATE_PREAUTH:%',v_existing USING ERRCODE='23505'; END IF;

  INSERT INTO public.pre_authorizations (
    patient_id,client_name,client_date_of_birth,client_phone,client_email,client_address,client_identifier,client_membership_number,
    doctor_id,procedure_id,diagnosis,procedure_date,insurance_company_id,insurer_name,insurer_member_number,insurer_plan_name,
    insurer_phone,insurer_email,insurer_policy_reference,provider_name,provider_address,provider_phone,total_cost,status,created_by,
    accommodation_days,clinical_notes,approval_notes,custom_diagnoses,diagnosis_ids,template_id,dedup_fingerprint,duplicate_checked_at
  ) VALUES (
    NULLIF(p_payload->>'patient_id','')::uuid,NULLIF(p_payload->>'client_name',''),NULLIF(p_payload->>'client_date_of_birth','')::date,
    NULLIF(p_payload->>'client_phone',''),NULLIF(p_payload->>'client_email',''),NULLIF(p_payload->>'client_address',''),NULLIF(p_payload->>'client_identifier',''),NULLIF(p_payload->>'client_membership_number',''),
    NULLIF(p_payload->>'doctor_id','')::uuid,NULLIF(p_payload->>'procedure_id','')::uuid,NULLIF(p_payload->>'diagnosis',''),NULLIF(p_payload->>'procedure_date','')::date,
    NULLIF(p_payload->>'insurance_company_id','')::uuid,trim(p_payload->>'insurer_name'),NULLIF(p_payload->>'insurer_member_number',''),NULLIF(p_payload->>'insurer_plan_name',''),
    NULLIF(p_payload->>'insurer_phone',''),NULLIF(p_payload->>'insurer_email',''),NULLIF(p_payload->>'insurer_policy_reference',''),NULLIF(p_payload->>'provider_name',''),NULLIF(p_payload->>'provider_address',''),NULLIF(p_payload->>'provider_phone',''),
    coalesce((p_payload->>'total_cost')::numeric,0),coalesce(NULLIF(p_payload->>'status',''),'pending'),auth.uid(),NULLIF(p_payload->>'accommodation_days','')::integer,
    NULLIF(p_payload->>'clinical_notes',''),NULLIF(p_payload->>'approval_notes',''),coalesce(p_payload->'custom_diagnoses','[]'::jsonb),coalesce(p_payload->'diagnosis_ids','[]'::jsonb),NULLIF(p_payload->>'template_id','')::uuid,v_fp,now()
  ) RETURNING * INTO v_row;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF trim(coalesce(v_item->>'description',''))='' THEN RAISE EXCEPTION 'Charge description is required'; END IF;
    INSERT INTO public.preauth_items(preauth_id,description,quantity,unit_price,amount)
    VALUES(v_row.id,trim(v_item->>'description'),greatest(1,coalesce((v_item->>'quantity')::numeric,1)),greatest(0,coalesce((v_item->>'unit_price')::numeric,0)),greatest(0,coalesce((v_item->>'amount')::numeric,0)));
  END LOOP;

  IF p_save_client_suggestion THEN
    INSERT INTO public.preauth_client_suggestions(normalized_name,client_name,date_of_birth,phone,email,address,identifier,membership_number,source_patient_id,created_by)
    VALUES(public.normalize_preauth_client_name(p_payload->>'client_name'),trim(p_payload->>'client_name'),NULLIF(p_payload->>'client_date_of_birth','')::date,NULLIF(p_payload->>'client_phone',''),NULLIF(p_payload->>'client_email',''),NULLIF(p_payload->>'client_address',''),NULLIF(p_payload->>'client_identifier',''),NULLIF(p_payload->>'client_membership_number',''),NULLIF(p_payload->>'patient_id','')::uuid,auth.uid())
    ON CONFLICT (normalized_name,COALESCE(membership_number,''),COALESCE(phone,'')) DO UPDATE SET
      client_name=EXCLUDED.client_name,date_of_birth=COALESCE(EXCLUDED.date_of_birth,public.preauth_client_suggestions.date_of_birth),phone=COALESCE(EXCLUDED.phone,public.preauth_client_suggestions.phone),email=COALESCE(EXCLUDED.email,public.preauth_client_suggestions.email),address=COALESCE(EXCLUDED.address,public.preauth_client_suggestions.address),identifier=COALESCE(EXCLUDED.identifier,public.preauth_client_suggestions.identifier),membership_number=COALESCE(EXCLUDED.membership_number,public.preauth_client_suggestions.membership_number),source_patient_id=COALESCE(EXCLUDED.source_patient_id,public.preauth_client_suggestions.source_patient_id),use_count=public.preauth_client_suggestions.use_count+1,last_used_at=now(),updated_at=now();
  END IF;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.create_preauthorization_atomic(JSONB,JSONB,BOOLEAN) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_preauthorization_atomic(JSONB,JSONB,BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.preauth_complete_fingerprint(JSONB,JSONB) FROM PUBLIC,anon,authenticated;
