-- Facility-scoped company letterhead settings and logo storage.
-- Keep the existing global branding as a read-only fallback for facilities
-- that have not customized their own letterhead.

CREATE OR REPLACE FUNCTION public.get_facility_letterhead_settings(p_facility_id UUID)
RETURNS TABLE (key TEXT, value TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_settings JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to read facility letterhead settings.'
      USING ERRCODE = '42501';
  END IF;
  IF p_facility_id IS NULL OR NOT security_internal.user_has_facility_access(p_facility_id) THEN
    RAISE EXCEPTION 'Active membership in the selected facility is required.'
      USING ERRCODE = '42501';
  END IF;
  IF NOT (
    security_internal.current_user_has_permission('settings.manage')
    OR security_internal.current_user_has_permission('reports.read')
    OR security_internal.current_user_has_permission('ledger.read')
    OR security_internal.current_user_has_permission('claims.read')
    OR security_internal.current_user_has_permission('preauth.read')
  ) THEN
    RAISE EXCEPTION 'Document or settings access is required to read letterhead settings.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(f.settings->'letterhead', '{}'::JSONB)
    INTO v_settings
    FROM public.facilities f
   WHERE f.id = p_facility_id
     AND f.active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected facility is unavailable.'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT allowed.setting_key,
         COALESCE(NULLIF(v_settings->>allowed.setting_key, ''), global_setting.value)
    FROM unnest(ARRAY[
      'provider_name','provider_address','provider_phone','provider_email','logo_url',
      'letterhead_accent','letterhead_style','letterhead_footer_note',
      'letterhead_show_banking','banking_partners'
    ]::TEXT[]) AS allowed(setting_key)
    LEFT JOIN public.system_settings global_setting
      ON global_setting.key = allowed.setting_key
   WHERE COALESCE(NULLIF(v_settings->>allowed.setting_key, ''), global_setting.value) IS NOT NULL
   ORDER BY allowed.setting_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_facility_letterhead_settings(
  p_facility_id UUID,
  p_settings JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key TEXT;
  v_facility_settings JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to save facility letterhead settings.'
      USING ERRCODE = '42501';
  END IF;
  IF p_facility_id IS NULL OR NOT security_internal.user_has_facility_access(p_facility_id) THEN
    RAISE EXCEPTION 'Active membership in the selected facility is required.'
      USING ERRCODE = '42501';
  END IF;
  IF NOT security_internal.current_user_has_permission('settings.manage') THEN
    RAISE EXCEPTION 'Settings management permission is required to change company letterhead.'
      USING ERRCODE = '42501';
  END IF;
  IF p_settings IS NULL OR jsonb_typeof(p_settings) <> 'object' THEN
    RAISE EXCEPTION 'Letterhead settings must be provided as a JSON object.'
      USING ERRCODE = '22023';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_settings)
  LOOP
    IF v_key <> ALL (ARRAY[
      'provider_name','provider_address','provider_phone','provider_email','logo_url',
      'letterhead_accent','letterhead_style','letterhead_footer_note',
      'letterhead_show_banking','banking_partners'
    ]::TEXT[]) THEN
      RAISE EXCEPTION 'Unsupported letterhead setting: %', v_key USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_settings->v_key) <> 'string' THEN
      RAISE EXCEPTION 'Letterhead setting % must be stored as a string.', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF length(COALESCE(p_settings->>'provider_name','')) > 200
     OR length(COALESCE(p_settings->>'provider_address','')) > 500
     OR length(COALESCE(p_settings->>'provider_phone','')) > 60
     OR length(COALESCE(p_settings->>'provider_email','')) > 254
     OR length(COALESCE(p_settings->>'logo_url','')) > 2048
     OR length(COALESCE(p_settings->>'letterhead_footer_note','')) > 500 THEN
    RAISE EXCEPTION 'A letterhead field exceeds its maximum allowed length.'
      USING ERRCODE = '22023';
  END IF;
  IF p_settings ? 'letterhead_accent'
     AND (p_settings->>'letterhead_accent') !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Letterhead accent must be a six-digit hexadecimal colour.'
      USING ERRCODE = '22023';
  END IF;
  IF p_settings ? 'letterhead_style'
     AND p_settings->>'letterhead_style' NOT IN ('bar','rule','minimal') THEN
    RAISE EXCEPTION 'Unsupported letterhead style.'
      USING ERRCODE = '22023';
  END IF;
  IF p_settings ? 'letterhead_show_banking'
     AND p_settings->>'letterhead_show_banking' NOT IN ('true','false') THEN
    RAISE EXCEPTION 'Show banking must be true or false.'
      USING ERRCODE = '22023';
  END IF;
  IF p_settings ? 'banking_partners' THEN
    BEGIN
      v_facility_settings := (p_settings->>'banking_partners')::JSONB;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Banking partners must be valid JSON.'
        USING ERRCODE = '22023';
    END;
    IF jsonb_typeof(v_facility_settings) <> 'array' OR jsonb_array_length(v_facility_settings) > 10 THEN
      RAISE EXCEPTION 'Banking partners must be an array with no more than ten entries.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.facilities f
     SET settings = jsonb_set(
       COALESCE(f.settings, '{}'::JSONB),
       '{letterhead}',
       COALESCE(f.settings->'letterhead', '{}'::JSONB) || p_settings,
       true
     )
   WHERE f.id = p_facility_id
     AND f.active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected facility is unavailable.'
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_facility_letterhead_settings(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_facility_letterhead_settings(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_facility_letterhead_settings(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_facility_letterhead_settings(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.get_facility_letterhead_settings(UUID) IS
  'Returns only the approved company letterhead allowlist for a facility member, preferring facility branding over global defaults.';
COMMENT ON FUNCTION public.save_facility_letterhead_settings(UUID, JSONB) IS
  'Allows facility settings managers to update only the validated company letterhead allowlist inside facilities.settings.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('facility-logos', 'facility-logos', true, 2097152, ARRAY['image/png','image/jpeg','image/webp','image/svg+xml'])
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 2097152,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS facility_logos_public_read ON storage.objects;
CREATE POLICY facility_logos_public_read
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'facility-logos');

DROP POLICY IF EXISTS facility_logos_member_upload ON storage.objects;
CREATE POLICY facility_logos_member_upload
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'facility-logos'
    AND EXISTS (
      SELECT 1 FROM public.facilities f
       WHERE f.id::TEXT = (storage.foldername(name))[1]
         AND f.active = true
         AND security_internal.user_has_facility_access(f.id)
         AND security_internal.current_user_has_permission('settings.manage')
    )
  );

DROP POLICY IF EXISTS facility_logos_member_update ON storage.objects;
CREATE POLICY facility_logos_member_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'facility-logos'
    AND EXISTS (
      SELECT 1 FROM public.facilities f
       WHERE f.id::TEXT = (storage.foldername(name))[1]
         AND f.active = true
         AND security_internal.user_has_facility_access(f.id)
         AND security_internal.current_user_has_permission('settings.manage')
    )
  )
  WITH CHECK (
    bucket_id = 'facility-logos'
    AND EXISTS (
      SELECT 1 FROM public.facilities f
       WHERE f.id::TEXT = (storage.foldername(name))[1]
         AND f.active = true
         AND security_internal.user_has_facility_access(f.id)
         AND security_internal.current_user_has_permission('settings.manage')
    )
  );

DROP POLICY IF EXISTS facility_logos_member_delete ON storage.objects;
CREATE POLICY facility_logos_member_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'facility-logos'
    AND EXISTS (
      SELECT 1 FROM public.facilities f
       WHERE f.id::TEXT = (storage.foldername(name))[1]
         AND f.active = true
         AND security_internal.user_has_facility_access(f.id)
         AND security_internal.current_user_has_permission('settings.manage')
    )
  );
