-- Reusable client suggestions are convenience data only. They never define the
-- insurer attached to a pre-authorization request.
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
CREATE UNIQUE INDEX IF NOT EXISTS preauth_client_suggestions_identity_uidx
  ON public.preauth_client_suggestions (normalized_name, membership_number, phone);
CREATE INDEX IF NOT EXISTS preauth_client_suggestions_name_idx
  ON public.preauth_client_suggestions (normalized_name);
CREATE INDEX IF NOT EXISTS preauth_client_suggestions_last_used_idx
  ON public.preauth_client_suggestions (last_used_at DESC);
ALTER TABLE public.preauth_client_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view preauth client suggestions"
  ON public.preauth_client_suggestions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create preauth client suggestions"
  ON public.preauth_client_suggestions FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update preauth client suggestions"
  ON public.preauth_client_suggestions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.normalize_preauth_client_name(p_name TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'));
$$;

-- Atomic creation: request + charge lines + optional reusable client suggestion.
CREATE OR REPLACE FUNCTION public.create_preauthorization_atomic(
  p_payload JSONB,
  p_items JSONB,
  p_save_client_suggestion BOOLEAN DEFAULT TRUE
)
RETURNS public.pre_authorizations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_preauth public.pre_authorizations;
  v_item JSONB;
  v_name TEXT := trim(coalesce(p_payload->>'client_name', ''));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'Client name is required'; END IF;
  IF trim(coalesce(p_payload->>'insurer_name', '')) = '' THEN RAISE EXCEPTION 'Insurer name is required'; END IF;

  INSERT INTO public.pre_authorizations (
    patient_id, client_name, client_date_of_birth, client_phone, client_email,
    client_address, client_identifier, client_membership_number,
    doctor_id, procedure_id, diagnosis, procedure_date,
    insurance_company_id, insurer_name, insurer_member_number, insurer_plan_name,
    insurer_phone, insurer_email, insurer_policy_reference,
    provider_name, provider_address, provider_phone, total_cost, status,
    created_by, accommodation_days, clinical_notes, approval_notes,
    custom_diagnoses, diagnosis_ids, template_id
  ) VALUES (
    NULLIF(p_payload->>'patient_id','')::UUID,
    v_name,
    NULLIF(p_payload->>'client_date_of_birth','')::DATE,
    NULLIF(p_payload->>'client_phone',''), NULLIF(p_payload->>'client_email',''),
    NULLIF(p_payload->>'client_address',''), NULLIF(p_payload->>'client_identifier',''),
    NULLIF(p_payload->>'client_membership_number',''),
    NULLIF(p_payload->>'doctor_id','')::UUID, NULLIF(p_payload->>'procedure_id','')::UUID,
    NULLIF(p_payload->>'diagnosis',''), NULLIF(p_payload->>'procedure_date','')::DATE,
    NULLIF(p_payload->>'insurance_company_id','')::UUID,
    trim(p_payload->>'insurer_name'), NULLIF(p_payload->>'insurer_member_number',''),
    NULLIF(p_payload->>'insurer_plan_name',''), NULLIF(p_payload->>'insurer_phone',''),
    NULLIF(p_payload->>'insurer_email',''), NULLIF(p_payload->>'insurer_policy_reference',''),
    NULLIF(p_payload->>'provider_name',''), NULLIF(p_payload->>'provider_address',''),
    NULLIF(p_payload->>'provider_phone',''), coalesce(NULLIF(p_payload->>'total_cost','')::NUMERIC, 0),
    coalesce(NULLIF(p_payload->>'status',''), 'pending'), auth.uid(),
    NULLIF(p_payload->>'accommodation_days','')::INTEGER,
    NULLIF(p_payload->>'clinical_notes',''), NULLIF(p_payload->>'approval_notes',''),
    coalesce(p_payload->'custom_diagnoses','[]'::jsonb),
    coalesce(p_payload->'diagnosis_ids','[]'::jsonb),
    NULLIF(p_payload->>'template_id','')::UUID
  ) RETURNING * INTO v_preauth;

  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) LOOP
    INSERT INTO public.preauth_items(preauth_id, description, quantity, unit_price, amount)
    VALUES (v_preauth.id, trim(v_item->>'description'),
      greatest(1, coalesce((v_item->>'quantity')::INTEGER,1)),
      greatest(0, coalesce((v_item->>'unit_price')::NUMERIC,0)),
      greatest(0, coalesce((v_item->>'amount')::NUMERIC,0)));
  END LOOP;

  IF p_save_client_suggestion THEN
    INSERT INTO public.preauth_client_suggestions
      (normalized_name, client_name, date_of_birth, phone, email, address, identifier, membership_number, source_patient_id, created_by)
    VALUES (
      public.normalize_preauth_client_name(v_name), v_name,
      NULLIF(p_payload->>'client_date_of_birth','')::DATE,
      NULLIF(p_payload->>'client_phone',''), NULLIF(p_payload->>'client_email',''),
      NULLIF(p_payload->>'client_address',''), NULLIF(p_payload->>'client_identifier',''),
      NULLIF(p_payload->>'client_membership_number',''),
      NULLIF(p_payload->>'patient_id','')::UUID, auth.uid());
  END IF;

  RETURN v_preauth;
END;
$$;
REVOKE ALL ON FUNCTION public.create_preauthorization_atomic(JSONB,JSONB,BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_preauthorization_atomic(JSONB,JSONB,BOOLEAN) TO authenticated;
