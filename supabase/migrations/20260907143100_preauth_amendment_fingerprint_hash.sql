-- Replace the amendment fingerprint implementation with md5 so the workflow
-- does not depend on an extension being enabled in a tenant deployment.

CREATE OR REPLACE FUNCTION public.update_preauthorization_atomic(
  p_preauth_id UUID, p_payload JSONB, p_items JSONB, p_reason TEXT DEFAULT 'amended'
)
RETURNS public.pre_authorizations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_row public.pre_authorizations;
  v_item JSONB;
  v_total NUMERIC := 0;
  v_quantity NUMERIC;
  v_unit_price NUMERIC;
  v_amount NUMERIC;
  v_description TEXT;
  v_client_name TEXT;
  v_insurer_name TEXT;
  v_fingerprint TEXT;
  v_version_exists BOOLEAN;
  v_index INTEGER := 0;
BEGIN
  IF (select auth.uid()) IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_preauth_id IS NULL THEN RAISE EXCEPTION 'PREAUTH_ID_REQUIRED'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.preauthorization_versions v WHERE v.preauth_id = p_preauth_id) INTO v_version_exists;
  IF NOT v_version_exists THEN PERFORM public.create_preauth_version(p_preauth_id, 'baseline'); END IF;

  SELECT * INTO v_row FROM public.pre_authorizations WHERE id = p_preauth_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PREAUTH_NOT_FOUND'; END IF;

  v_client_name := NULLIF(trim(coalesce(p_payload->>'client_name', v_row.client_name)), '');
  v_insurer_name := NULLIF(trim(coalesce(p_payload->>'insurer_name', v_row.insurer_name)), '');
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

  v_fingerprint := md5(
    coalesce(public.preauth_normalize_identity(v_client_name), '') || '|' ||
    coalesce(p_payload->>'client_date_of_birth', v_row.client_date_of_birth::TEXT, '') || '|' ||
    coalesce(public.preauth_normalize_identity(v_insurer_name), '') || '|' ||
    coalesce(p_payload->>'insurer_member_number', v_row.insurer_member_number, '') || '|' ||
    coalesce(p_payload->>'procedure_date', v_row.procedure_date::TEXT, '') || '|' ||
    coalesce(p_payload->>'procedure_id', v_row.procedure_id::TEXT, '') || '|' ||
    coalesce(p_payload->>'doctor_id', v_row.doctor_id::TEXT, '') || '|' ||
    coalesce(p_payload->>'diagnosis', v_row.diagnosis, '') || '|' || v_total::TEXT || '|' ||
    coalesce((SELECT string_agg(coalesce(trim(x->>'description'),'') || ':' || ((x->>'quantity')::NUMERIC)::TEXT || ':' || ((x->>'unit_price')::NUMERIC)::TEXT, '|' ORDER BY ord)
              FROM jsonb_array_elements(p_items) WITH ORDINALITY AS a(x, ord)), '')
  );

  PERFORM pg_advisory_xact_lock(hashtextextended('preauth-create:' || v_fingerprint, 0));
  IF EXISTS (SELECT 1 FROM public.pre_authorizations p WHERE p.id <> p_preauth_id AND p.dedup_fingerprint = v_fingerprint AND p.status NOT IN ('cancelled','void')) THEN RAISE EXCEPTION 'DUPLICATE_PREAUTH'; END IF;

  UPDATE public.pre_authorizations SET
    patient_id = coalesce(NULLIF(p_payload->>'patient_id','')::UUID, patient_id),
    doctor_id = coalesce(NULLIF(p_payload->>'doctor_id','')::UUID, doctor_id),
    procedure_id = coalesce(NULLIF(p_payload->>'procedure_id','')::UUID, procedure_id),
    diagnosis = coalesce(NULLIF(trim(p_payload->>'diagnosis'), ''), diagnosis),
    procedure_date = coalesce(NULLIF(p_payload->>'procedure_date','')::DATE, procedure_date),
    insurance_company_id = coalesce(NULLIF(p_payload->>'insurance_company_id','')::UUID, insurance_company_id),
    provider_name = coalesce(NULLIF(trim(p_payload->>'provider_name'), ''), provider_name),
    provider_address = coalesce(NULLIF(trim(p_payload->>'provider_address'), ''), provider_address),
    provider_phone = coalesce(NULLIF(trim(p_payload->>'provider_phone'), ''), provider_phone),
    total_cost = v_total,
    status = CASE WHEN status IN ('approved','rejected','submitted') THEN 'amended' ELSE status END,
    client_name = v_client_name,
    client_date_of_birth = coalesce(NULLIF(p_payload->>'client_date_of_birth','')::DATE, client_date_of_birth),
    client_phone = coalesce(NULLIF(trim(p_payload->>'client_phone'), ''), client_phone),
    client_email = coalesce(NULLIF(trim(p_payload->>'client_email'), ''), client_email),
    client_address = coalesce(NULLIF(trim(p_payload->>'client_address'), ''), client_address),
    client_identifier = coalesce(NULLIF(trim(p_payload->>'client_identifier'), ''), client_identifier),
    client_membership_number = coalesce(NULLIF(trim(p_payload->>'client_membership_number'), ''), client_membership_number),
    insurer_name = v_insurer_name,
    insurer_member_number = coalesce(NULLIF(trim(p_payload->>'insurer_member_number'), ''), insurer_member_number),
    insurer_plan_name = coalesce(NULLIF(trim(p_payload->>'insurer_plan_name'), ''), insurer_plan_name),
    insurer_phone = coalesce(NULLIF(trim(p_payload->>'insurer_phone'), ''), insurer_phone),
    insurer_email = coalesce(NULLIF(trim(p_payload->>'insurer_email'), ''), insurer_email),
    insurer_policy_reference = coalesce(NULLIF(trim(p_payload->>'insurer_policy_reference'), ''), insurer_policy_reference),
    dedup_fingerprint = v_fingerprint
  WHERE id = p_preauth_id RETURNING * INTO v_row;

  DELETE FROM public.preauth_items WHERE preauth_id = p_preauth_id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.preauth_items (preauth_id, description, quantity, unit_price, amount)
    VALUES (p_preauth_id, trim(v_item->>'description'), (v_item->>'quantity')::NUMERIC, (v_item->>'unit_price')::NUMERIC,
            round((v_item->>'quantity')::NUMERIC * (v_item->>'unit_price')::NUMERIC, 2));
  END LOOP;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_preauthorization_atomic(UUID, JSONB, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_preauthorization_atomic(UUID, JSONB, JSONB, TEXT) TO authenticated;
