-- Read the effective approved WHT rate without granting access to system_settings.
-- Facility-level settings take precedence; the global Settings-page rate is the fallback.

CREATE OR REPLACE FUNCTION security_internal.configured_withholding_tax_rate(p_facility_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rate NUMERIC;
  v_raw_rate TEXT;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to read the facility withholding-tax rate.'
      USING ERRCODE = '42501';
  END IF;
  IF p_facility_id IS NULL OR NOT security_internal.user_has_facility_access(p_facility_id) THEN
    RAISE EXCEPTION 'Active membership in the selected facility is required.'
      USING ERRCODE = '42501';
  END IF;

  SELECT f.settings->>'withholding_tax_rate'
    INTO v_raw_rate
    FROM public.facilities AS f
   WHERE f.id = p_facility_id
     AND f.active = true;

  IF NULLIF(pg_catalog.btrim(v_raw_rate), '') IS NULL THEN
    SELECT s.value
      INTO v_raw_rate
      FROM public.system_settings AS s
     WHERE s.key = 'withholding_tax_rate';
  END IF;

  IF NULLIF(pg_catalog.btrim(v_raw_rate), '') IS NULL THEN
    RAISE EXCEPTION 'No approved provisional WHT rate is configured. An authorized administrator must configure it in Settings before claims can be submitted.'
      USING ERRCODE = '55000';
  END IF;

  BEGIN
    v_rate := NULLIF(pg_catalog.btrim(v_raw_rate), '')::NUMERIC;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'The configured provisional WHT rate is invalid. An authorized administrator must correct it.'
      USING ERRCODE = '22023';
  END;

  IF v_rate < 0 OR v_rate > 100 THEN
    RAISE EXCEPTION 'The configured provisional WHT rate must be between 0 and 100.'
      USING ERRCODE = '22023';
  END IF;

  RETURN v_rate;
END;
$$;

REVOKE ALL ON FUNCTION security_internal.configured_withholding_tax_rate(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_configured_withholding_tax_rate(p_facility_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN security_internal.configured_withholding_tax_rate(p_facility_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_configured_withholding_tax_rate(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_configured_withholding_tax_rate(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_configured_withholding_tax_rate(UUID) IS
  'Returns only the approved WHT percentage for a facility member; prefers facility settings and falls back to the global Settings-page rate without exposing system_settings.';
