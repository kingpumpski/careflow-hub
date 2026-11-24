-- Facility-approved provisional WHT configuration.
-- The value is stored in the owning facility's settings JSON and is read by
-- the monthly-claim RPC only after it verifies active facility membership.

CREATE OR REPLACE FUNCTION security_internal.set_facility_provisional_wht_rate(
  p_facility_id UUID,
  p_rate NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_settings JSONB;
  v_new_settings JSONB;
  v_actor UUID := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.'
      USING ERRCODE = '42501';
  END IF;
  IF NOT security_internal.current_user_has_any_role(ARRAY['superuser'::public.app_role, 'admin'::public.app_role])
     OR NOT security_internal.current_user_has_permission('settings.manage') THEN
    RAISE EXCEPTION 'System administrator settings permission is required.'
      USING ERRCODE = '42501';
  END IF;
  IF p_facility_id IS NULL THEN
    RAISE EXCEPTION 'Select a facility.'
      USING ERRCODE = '22023';
  END IF;
  IF p_rate IS NULL OR p_rate::TEXT IN ('NaN', 'Infinity', '-Infinity')
     OR p_rate < 0 OR p_rate > 100 THEN
    RAISE EXCEPTION 'The approved provisional WHT rate must be between 0 and 100.'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(f.settings, '{}'::jsonb)
    INTO v_old_settings
    FROM public.facilities AS f
   WHERE f.id = p_facility_id
     AND f.active = true
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected facility is not active.'
      USING ERRCODE = '22023';
  END IF;

  v_new_settings := jsonb_set(v_old_settings, '{withholding_tax_rate}', to_jsonb(p_rate), true);

  UPDATE public.facilities
     SET settings = v_new_settings,
         updated_at = now()
   WHERE id = p_facility_id;

  INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
  VALUES (
    'facilities', p_facility_id::TEXT, 'update_provisional_wht_rate',
    jsonb_build_object('withholding_tax_rate', v_old_settings->'withholding_tax_rate'),
    jsonb_build_object('withholding_tax_rate', v_new_settings->'withholding_tax_rate'),
    v_actor
  );

  RETURN p_rate;
END;
$$;

REVOKE ALL ON FUNCTION security_internal.set_facility_provisional_wht_rate(UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION security_internal.set_facility_provisional_wht_rate(UUID, NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_facility_provisional_wht_rate(
  p_facility_id UUID,
  p_rate NUMERIC
)
RETURNS NUMERIC
LANGUAGE SQL
SECURITY INVOKER
SET search_path = ''
AS $wrapper$
  SELECT security_internal.set_facility_provisional_wht_rate(p_facility_id, p_rate);
$wrapper$;

REVOKE ALL ON FUNCTION public.set_facility_provisional_wht_rate(UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_facility_provisional_wht_rate(UUID, NUMERIC) TO authenticated;

COMMENT ON FUNCTION public.set_facility_provisional_wht_rate(UUID, NUMERIC) IS
  'Sets the facility-approved provisional WHT rate; actual WHT remains sourced from insurer payment advice.';
