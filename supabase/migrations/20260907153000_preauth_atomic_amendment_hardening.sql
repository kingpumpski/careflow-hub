-- Recreate the amendment RPC so it uses the same facility, validation and
-- duplicate semantics as creation. The facility is taken from the existing row;
-- clients cannot move a request between facilities during amendment.

CREATE OR REPLACE FUNCTION public.update_preauthorization_atomic(
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
  IF p_preauth_id IS NULL THEN RAISE EXCEPTION 'PREAUTH_ID_REQUIRED'; END IF;

  SELECT * INTO v_row FROM public.pre_authorizations WHERE id=p_preauth_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PREAUTH_NOT_FOUND'; END IF;
  v_facility := v_row.facility_id;
  IF v_facility IS NULL THEN RAISE EXCEPTION 'FACILITY_REQUIRED'; END IF;
  IF NOT public.user_has_facility_access(v_facility) THEN RAISE EXCEPTION 'FACILITY_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF trim(coalesce(p_payload->>'client_name',v_row.client_name,'')) = '' THEN RAISE EXCEPTION 'CLIENT_NAME_REQUIRED'; END IF;
  IF trim(coalesce(p_payload->>'insurer_name',v_row.insurer_name,'')) = '' THEN RAISE EXCEPTION 'INSURER_NAME_REQUIRED'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_facility::text || ':' || p_preauth_id::text,0));
  v_total := public.preauth_validate_items(p_items);
  IF round(v_total,2) <> round(coalesce((p_payload->>'total_cost')::numeric,v_total),2) THEN RAISE EXCEPTION 'TOTAL_COST_MISMATCH'; END IF;

  v_fp := public.preauth_complete_fingerprint(jsonb_set(coalesce(p_payload,'{}'::jsonb),'{"facility_id