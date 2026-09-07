-- Pre-Authorization atomic boundary hardening.
-- This migration makes the server authoritative for charge totals and closes
-- the check-then-insert race with a transaction-scoped advisory lock.

CREATE OR REPLACE FUNCTION public.preauth_complete_fingerprint(p_payload JSONB, p_items JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT md5(jsonb_build_object(
    'patient_id', NULLIF(trim(coalesce(p_payload->>'patient_id','')), ''),
    'client_name', public.normalize_preauth_client_name(p_payload->>'client_name'),
    'dob', NULLIF(trim(coalesce(p_payload->>'client_date_of_birth','')), ''),
    'identifier', lower(trim(coalesce(p_payload->>'client_identifier',''))),
    'membership', lower(trim(coalesce(p_payload->>'client_membership_number',''))),
    'insurance_id', NULLIF(trim(coalesce(p_payload->>'insurance_company_id','')), ''),
    'insurer', lower(regexp_replace(trim(coalesce(p_payload->>'insurer_name','')), '\\s+', ' ', 'g')),
    'member', lower(trim(coalesce(p_payload->>'insurer_member_number',''))),
    'plan', lower(regexp_replace(trim(coalesce(p_payload->>'insurer_plan_name','')), '\\s+', ' ', 'g')),
    'policy', lower(trim(coalesce(p_payload->>'insurer_policy_reference',''))),
    'doctor_id', NULLIF(trim(coalesce(p_payload->>'doctor_id','')), ''),
    'procedure_id', NULLIF(trim(coalesce(p_payload->>'procedure_id','')), ''),
    'procedure_date', NULLIF(trim(coalesce(p_payload->>'procedure_date','')), ''),
    'diagnosis', lower(regexp_replace(trim(coalesce(p_payload->>'diagnosis','')), '\\s+', ' ', 'g')),
    'items', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'description', lower(regexp_replace(trim(coalesce(value->>'description','')), '\\s+', ' ', 'g')),
        'quantity', round((coalesce(value->>'quantity','1'))::numeric, 4),
        'unit_price', round((coalesce(value->>'unit_price','0'))::numeric, 2)
      ) ORDER BY lower(regexp_replace(trim(coalesce(value->>'description','')), '\\s+', ' ', 'g')), (coalesce(value->>'quantity','1'))::numeric, (coalesce(value->>'unit_price','0'))::numeric), '[]'::jsonb)
      FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
    )
  )::text);
$$;

CREATE OR REPLACE FUNCTION public.find_duplicate_preauthorization_text_first(
  p_client_name TEXT,
  p_client_date_of_birth DATE DEFAULT NULL,
  p_client_identifier TEXT DEFAULT NULL,
  p_client_membership_number TEXT DEFAULT NULL,
  p_insurer_name TEXT DEFAULT NULL,
  p_insurer_member_number TEXT DEFAULT NULL,
  p_insurer_plan_name TEXT DEFAULT NULL,
  p_procedure_date DATE DEFAULT NULL,
  p_procedure_id UUID DEFAULT NULL,
  p_diagnosis TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::jsonb,
  p_exclude_id UUID DEFAULT NULL
)
RETURNS TABLE(id UUID, request_number TEXT, status TEXT, created_at TIMESTAMPTZ, total_cost NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payload JSONB;
  v_fp TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_payload := jsonb_build_object(
    'client_name', p_client_name,
    'client_date_of_birth', p_client_date_of_birth,
    'client_identifier', p_client_identifier,
    'client_membership_number', p_client_membership_number,
    'insurer_name', p_insurer_name,
    'insurer_member_number', p_insurer_member_number,
    'insurer_plan_name', p_insurer_plan_name,
    'procedure_date', p_procedure_date,
    'procedure_id', p_procedure_id,
    'diagnosis', p_diagnosis
  );
  v_fp := public.preauth_complete_fingerprint(v_payload, p_items);

  RETURN QUERY
  SELECT p.id, p.request_number, p.status, p.created_at, p.total_cost
  FROM public.pre_authorizations p
  WHERE p.dedup_fingerprint = v_fp
    AND p.created_at >= now() - interval '30 days'
    AND lower(coalesce(p.status, '')) <> 'rejected'
    AND (p_exclude_id IS NULL OR p.id <> p_exclude_id)
  ORDER BY p.created_at DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.find_duplicate_preauthorization_text_first(TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, UUID, TEXT, JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_duplicate_preauthorization_text_first(TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, UUID, TEXT, JSONB, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_preauthorization_atomic(
  p_payload JSONB,
  p_items JSONB,
  p_save_client_suggestion BOOLEAN DEFAULT TRUE
)
RETURNS public.pre_authorizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.pre_authorizations;
  v_item JSONB;
  v_items JSONB := '[]'::jsonb;
  v_description TEXT;
  v_quantity NUMERIC;
  v_unit_price NUMERIC;
  v_amount NUMERIC;
  v_total NUMERIC := 0;
  v_fp TEXT;
  v_existing UUID;
  v_lock_key BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF trim(coalesce(p_payload->>'client_name', '')) = '' THEN
    RAISE EXCEPTION 'Client name is required';
  END IF;
  IF trim(coalesce(p_payload->>'insurer_name', '')) = '' THEN
    RAISE EXCEPTION 'Insurer name is required';
  END IF;
  IF jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'At least one charge line is required';
  END IF;
  IF jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION 'A pre-authorization cannot contain more than 200 charge lines';
  END IF;

  -- Normalize and validate every line before computing identity or writing data.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_description := trim(coalesce(v_item->>'description', ''));
    IF v_description = '' THEN RAISE EXCEPTION 'Charge description is required'; END IF;
    IF length(v_description) > 500 THEN RAISE EXCEPTION 'Charge description is too long'; END IF;
    BEGIN
      v_quantity := coalesce((v_item->>'quantity')::numeric, 1);
      v_unit_price := coalesce((v_item->>'unit_price')::numeric, 0);
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Invalid charge quantity or unit price';
    END;
    IF v_quantity <= 0 OR v_quantity > 100000 THEN RAISE EXCEPTION 'Charge quantity must be greater than zero and within the supported range'; END IF;
    IF v_unit_price < 0 OR v_unit_price > 1000000000 THEN RAISE EXCEPTION 'Charge unit price is outside the supported range'; END IF;
    v_amount := round(v_quantity * v_unit_price, 2);
    v_total := round(v_total + v_amount, 2);
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'description', v_description,
      'quantity', v_quantity,
      'unit_price', v_unit_price,
      'amount', v_amount
    ));
  END LOOP;

  -- Identity is calculated from normalized, server-validated values.
  v_fp := public.preauth_complete_fingerprint(
    jsonb_set(p_payload, '{total_cost}', to_jsonb(v_total), true),
    v_items
  );

  -- pg_advisory_xact_lock serializes identical fingerprints within the transaction.
  v_lock_key := hashtextextended(v_fp, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT p.id INTO v_existing
  FROM public.pre_authorizations p
  WHERE p.dedup_fingerprint = v_fp
    AND p.created_at >= now() - interval '30 days'
    AND lower(coalesce(p.status, '')) <> 'rejected'
  ORDER BY p.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICATE_PREAUTH:%', v_existing USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.pre_authorizations (
    patient_id, client_name, client_date_of_birth, client_phone, client_email, client_address,
    client_identifier, client_membership_number, doctor_id, procedure_id, diagnosis, procedure_date,
    insurance_company_id, insurer_name, insurer_member_number, insurer_plan_name, insurer_phone,
    insurer_email, insurer_policy_reference, provider_name, provider_address, provider_phone,
    total_cost, status, created_by, accommodation_days, clinical_notes, approval_notes,
    custom_diagnoses, diagnosis_ids, template_id, dedup_fingerprint, duplicate_checked_at
  ) VALUES (
    NULLIF(p_payload->>'patient_id','')::uuid,
    trim(p_payload->>'client_name'),
    NULLIF(p_payload->>'client_date_of_birth','')::date,
    NULLIF(trim(p_payload->>'client_phone'),''),
    NULLIF(trim(p_payload->>'client_email'),''),
    NULLIF(trim(p_payload->>'client_address'),''),
    NULLIF(trim(p_payload->>'client_identifier'),''),
    NULLIF(trim(p_payload->>'client_membership_number'),''),
    NULLIF(p_payload->>'doctor_id','')::uuid,
    NULLIF(p_payload->>'procedure_id','')::uuid,
    NULLIF(trim(p_payload->>'diagnosis'),''),
    NULLIF(p_payload->>'procedure_date','')::date,
    NULLIF(p_payload->>'insurance_company_id','')::uuid,
    trim(p_payload->>'insurer_name'),
    NULLIF(trim(p_payload->>'insurer_member_number'),''),
    NULLIF(trim(p_payload->>'insurer_plan_name'),''),
    NULLIF(trim(p_payload->>'insurer_phone'),''),
    NULLIF(trim(p_payload->>'insurer_email'),''),
    NULLIF(trim(p_payload->>'insurer_policy_reference'),''),
    NULLIF(trim(p_payload->>'provider_name'),''),
    NULLIF(trim(p_payload->>'provider_address'),''),
    NULLIF(trim(p_payload->>'provider_phone'),''),
    v_total,
    coalesce(NULLIF(lower(trim(p_payload->>'status')), ''), 'pending'),
    auth.uid(),
    NULLIF(p_payload->>'accommodation_days','')::integer,
    NULLIF(trim(p_payload->>'clinical_notes'),''),
    NULLIF(trim(p_payload->>'approval_notes'),''),
    coalesce(p_payload->'custom_diagnoses','[]'::jsonb),
    coalesce(p_payload->'diagnosis_ids','[]'::jsonb),
    NULLIF(p_payload->>'template_id','')::uuid,
    v_fp,
    now()
  ) RETURNING * INTO v_row;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    INSERT INTO public.preauth_items(preauth_id, description, quantity, unit_price, amount)
    VALUES (
      v_row.id,
      v_item->>'description',
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price')::numeric,
      (v_item->>'amount')::numeric
    );
  END LOOP;

  IF p_save_client_suggestion THEN
    INSERT INTO public.preauth_client_suggestions(
      normalized_name, client_name, date_of_birth, phone, email, address,
      identifier, membership_number, source_patient_id, created_by
    ) VALUES (
      public.normalize_preauth_client_name(p_payload->>'client_name'),
      trim(p_payload->>'client_name'),
      NULLIF(p_payload->>'client_date_of_birth','')::date,
      NULLIF(trim(p_payload->>'client_phone'),''),
      NULLIF(trim(p_payload->>'client_email'),''),
      NULLIF(trim(p_payload->>'client_address'),''),
      NULLIF(trim(p_payload->>'client_identifier'),''),
      NULLIF(trim(p_payload->>'client_membership_number'),''),
      NULLIF(p_payload->>'patient_id','')::uuid,
      auth.uid()
    )
    ON CONFLICT (normalized_name, COALESCE(membership_number,''), COALESCE(phone,'')) DO UPDATE SET
      client_name = EXCLUDED.client_name,
      date_of_birth = COALESCE(EXCLUDED.date_of_birth, public.preauth_client_suggestions.date_of_birth),
      phone = COALESCE(EXCLUDED.phone, public.preauth_client_suggestions.phone),
      email = COALESCE(EXCLUDED.email, public.preauth_client_suggestions.email),
      address = COALESCE(EXCLUDED.address, public.preauth_client_suggestions.address),
      identifier = COALESCE(EXCLUDED.identifier, public.preauth_client_suggestions.identifier),
      membership_number = COALESCE(EXCLUDED.membership_number, public.preauth_client_suggestions.membership_number),
      source_patient_id = COALESCE(EXCLUDED.source_patient_id, public.preauth_client_suggestions.source_patient_id),
      use_count = public.preauth_client_suggestions.use_count + 1,
      last_used_at = now(),
      updated_at = now();
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_preauthorization_atomic(JSONB, JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_preauthorization_atomic(JSONB, JSONB, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.preauth_complete_fingerprint(JSONB, JSONB) FROM PUBLIC, anon, authenticated;
