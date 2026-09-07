-- Server-authoritative pre-authorization creation and duplicate protection.
-- Facility-neutral by design: facility/tenant context remains separate from
-- client and payer identity so the same client can use different insurers.

CREATE OR REPLACE FUNCTION public.preauth_normalize_identity(p_value TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(regexp_replace(lower(trim(coalesce(p_value, ''))), '\\s+', ' ', 'g'), '');
$$;

CREATE OR REPLACE FUNCTION public.create_preauthorization_atomic(
  p_payload JSONB, p_items JSONB, p_save_client_suggestion BOOLEAN DEFAULT false
)
RETURNS public.pre_authorizations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_row public.pre_authorizations;
  v_item JSONB;
  v_description TEXT;
  v_quantity NUMERIC;
  v_unit_price NUMERIC;
  v_amount NUMERIC;
  v_total NUMERIC := 0;
  v_supplied_total NUMERIC;
  v_client_name TEXT;
  v_insurer_name TEXT;
  v_fingerprint TEXT;
  v_index INTEGER := 0;
BEGIN
  IF (select auth.uid()) IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  v_client_name := NULLIF(trim(p_payload->>'client_name'), '');
  v_insurer_name := NULLIF(trim(p_payload->>'insurer_name'), '');
  IF v_client_name IS NULL THEN RAISE EXCEPTION 'CLIENT_NAME_REQUIRED'; END IF;
  IF v_insurer_name IS NULL THEN RAISE EXCEPTION 'INSURER_NAME_REQUIRED'; END IF;
  IF jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'PREAUTH_ITEMS_REQUIRED'; END IF;
  IF jsonb_array_length(p_items) > 100 THEN RAISE EXCEPTION 'PREAUTH_TOO_MANY_ITEMS'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_index := v_index + 1;
    v_description := NULLIF(trim(v_item->>'description'), '');
    IF v_description IS NULL OR length(v_description) > 500 THEN RAISE EXCEPTION 'INVALID_ITEM_DESCRIPTION:%', v_index; END IF;
    BEGIN
      v_quantity := (v_item->>'quantity')::NUMERIC;
      v_unit_price := (v_item->>'unit_price')::NUMERIC;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'INVALID_ITEM_NUMBER:%', v_index; END;
    IF v_quantity IS NULL OR v_quantity <= 0 OR v_quantity > 1000000 THEN RAISE EXCEPTION 'INVALID_ITEM_QUANTITY:%', v_index; END IF;
    IF v_unit_price IS NULL OR v_unit_price < 0 OR v_unit_price > 100000000000 THEN RAISE EXCEPTION 'INVALID_ITEM_UNIT_PRICE:%', v_index; END IF;
    v_amount := round(v_quantity * v_unit_price, 2);
    v_total := v_total + v_amount;
  END LOOP;
  v_total := round(v_total, 2);

  IF p_payload ? 'total_cost' AND NULLIF(trim(p_payload->>'total_cost'), '') IS NOT NULL THEN
    BEGIN v_supplied_total := (p_payload->>'total_cost')::NUMERIC;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'INVALID_TOTAL_COST'; END;
    IF round(v_supplied_total, 2) <> v_total THEN RAISE EXCEPTION 'TOTAL_COST_MISMATCH'; END IF;
  END IF;

  v_fingerprint := md5(
    coalesce(public.preauth_normalize_identity(v_client_name), '') || '|' ||
    coalesce(p_payload->>'client_date_of_birth', '') || '|' ||
    coalesce(public.preauth_normalize_identity(v_insurer_name), '') || '|' ||
    coalesce(p_payload->>'insurer_member_number', '') || '|' ||
    coalesce(p_payload->>'procedure_date', '') || '|' || coalesce(p_payload->>'procedure_id', '') || '|' ||
    coalesce(p_payload->>'doctor_id', '') || '|' || coalesce(p_payload->>'diagnosis', '') || '|' || v_total::TEXT || '|' ||
    coalesce((SELECT string_agg(coalesce(trim(x->>'description'), '') || ':' || ((x->>'quantity')::NUMERIC)::TEXT || ':' || ((x->>'unit_price')::NUMERIC)::TEXT, '|' ORDER BY ord)
              FROM jsonb_array_elements(p_items) WITH ORDINALITY AS a(x, ord)), '')
  );

  PERFORM pg_advisory_xact_lock(hashtextextended('preauth-create:' || v_fingerprint, 0));
  IF EXISTS (SELECT 1 FROM public.pre_authorizations p WHERE p.dedup_fingerprint = v_fingerprint AND p.status NOT IN ('cancelled', 'void')) THEN RAISE EXCEPTION 'DUPLICATE_PREAUTH'; END IF;

  INSERT INTO public.pre_authorizations (
    patient_id, doctor_id, procedure_id, diagnosis, procedure_date, insurance_company_id,
    provider_name, provider_address, provider_phone, total_cost, status, created_by,
    client_name, client_date_of_birth, client_phone, client_email, client_address,
    client_identifier, client_membership_number, insurer_name, insurer_member_number,
    insurer_plan_name, insurer_phone, insurer_email, insurer_policy_reference, dedup_fingerprint
  ) VALUES (
    NULLIF(p_payload->>'patient_id','')::UUID, NULLIF(p_payload->>'doctor_id','')::UUID,
    NULLIF(p_payload->>'procedure_id','')::UUID, NULLIF(trim(p_payload->>'diagnosis'), ''),
    NULLIF(p_payload->>'procedure_date','')::DATE, NULLIF(p_payload->>'insurance_company_id','')::UUID,
    NULLIF(trim(p_payload->>'provider_name'), ''), NULLIF(trim(p_payload->>'provider_address'), ''),
    NULLIF(trim(p_payload->>'provider_phone'), ''), v_total, coalesce(NULLIF(p_payload->>'status',''), 'draft'),
    (select auth.uid()), v_client_name, NULLIF(p_payload->>'client_date_of_birth','')::DATE,
    NULLIF(trim(p_payload->>'client_phone'), ''), NULLIF(trim(p_payload->>'client_email'), ''),
    NULLIF(trim(p_payload->>'client_address'), ''), NULLIF(trim(p_payload->>'client_identifier'), ''),
    NULLIF(trim(p_payload->>'client_membership_number'), ''), v_insurer_name,
    NULLIF(trim(p_payload->>'insurer_member_number'), ''), NULLIF(trim(p_payload->>'insurer_plan_name'), ''),
    NULLIF(trim(p_payload->>'insurer_phone'), ''), NULLIF(trim(p_payload->>'insurer_email'), ''),
    NULLIF(trim(p_payload->>'insurer_policy_reference'), ''), v_fingerprint
  ) RETURNING * INTO v_row;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.preauth_items (preauth_id, description, quantity, unit_price, amount)
    VALUES (v_row.id, trim(v_item->>'description'), (v_item->>'quantity')::NUMERIC, (v_item->>'unit_price')::NUMERIC,
            round((v_item->>'quantity')::NUMERIC * (v_item->>'unit_price')::NUMERIC, 2));
  END LOOP;

  IF p_save_client_suggestion THEN
    INSERT INTO public.preauth_client_suggestions (
      normalized_name, client_name, date_of_birth, phone, email, address, identifier,
      membership_number, source_patient_id, use_count, last_used_at, created_by, updated_at
    ) VALUES (
      public.preauth_normalize_identity(v_client_name), v_client_name, NULLIF(p_payload->>'client_date_of_birth','')::DATE,
      NULLIF(trim(p_payload->>'client_phone'), ''), NULLIF(trim(p_payload->>'client_email'), ''),
      NULLIF(trim(p_payload->>'client_address'), ''), NULLIF(trim(p_payload->>'client_identifier'), ''),
      NULLIF(trim(p_payload->>'client_membership_number'), ''), NULLIF(p_payload->>'patient_id','')::UUID,
      1, now(), (select auth.uid()), now()
    )
    ON CONFLICT (normalized_name, COALESCE(membership_number,''), COALESCE(phone,''))
    DO UPDATE SET client_name = excluded.client_name, date_of_birth = excluded.date_of_birth,
      email = excluded.email, address = excluded.address, identifier = excluded.identifier,
      source_patient_id = excluded.source_patient_id, use_count = public.preauth_client_suggestions.use_count + 1,
      last_used_at = now(), updated_at = now();
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_preauthorization_atomic(JSONB, JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_preauthorization_atomic(JSONB, JSONB, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.find_duplicate_preauthorization_text_first(
  p_client_name TEXT, p_client_date_of_birth DATE DEFAULT NULL, p_insurer_name TEXT DEFAULT NULL,
  p_insurer_member_number TEXT DEFAULT NULL, p_procedure_date DATE DEFAULT NULL,
  p_procedure_id UUID DEFAULT NULL, p_doctor_id UUID DEFAULT NULL, p_diagnosis TEXT DEFAULT NULL,
  p_total_cost NUMERIC DEFAULT NULL, p_exclude_id UUID DEFAULT NULL
)
RETURNS TABLE(id UUID, request_number TEXT, status TEXT, created_at TIMESTAMPTZ, client_name TEXT, insurer_name TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT p.id, p.request_number, p.status, p.created_at, p.client_name, p.insurer_name
  FROM public.pre_authorizations p
  WHERE p.id IS DISTINCT FROM p_exclude_id AND p.status NOT IN ('cancelled', 'void')
    AND public.preauth_normalize_identity(p.client_name) = public.preauth_normalize_identity(p_client_name)
    AND (p_client_date_of_birth IS NULL OR p.client_date_of_birth = p_client_date_of_birth)
    AND (p_insurer_name IS NULL OR public.preauth_normalize_identity(p.insurer_name) = public.preauth_normalize_identity(p_insurer_name))
    AND (p_insurer_member_number IS NULL OR p.insurer_member_number = p_insurer_member_number)
    AND (p_procedure_date IS NULL OR p.procedure_date = p_procedure_date)
    AND (p_procedure_id IS NULL OR p.procedure_id = p_procedure_id)
    AND (p_doctor_id IS NULL OR p.doctor_id = p_doctor_id)
    AND (p_diagnosis IS NULL OR lower(trim(coalesce(p.diagnosis,''))) = lower(trim(p_diagnosis)))
    AND (p_total_cost IS NULL OR p.total_cost = round(p_total_cost,2))
  ORDER BY p.created_at DESC LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_duplicate_preauthorization_text_first(TEXT, DATE, TEXT, TEXT, DATE, UUID, UUID, TEXT, NUMERIC, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_duplicate_preauthorization_text_first(TEXT, DATE, TEXT, TEXT, DATE, UUID, UUID, TEXT, NUMERIC, UUID) TO authenticated;
