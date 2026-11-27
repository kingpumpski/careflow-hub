-- Allow all document/report readers to render the approved internal letterhead.
-- The helper still exposes only the small, non-secret branding allowlist.
CREATE OR REPLACE FUNCTION security_internal.get_report_letterhead_settings()
RETURNS TABLE (key text, value text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT (
    security_internal.current_user_has_permission('reports.read')
    OR security_internal.current_user_has_permission('ledger.read')
    OR security_internal.current_user_has_permission('claims.read')
    OR security_internal.current_user_has_permission('preauth.read')
  ) THEN
    RAISE EXCEPTION 'Document or report access is required to read letterhead settings'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT setting.key, setting.value
  FROM public.system_settings AS setting
  WHERE setting.key = ANY (ARRAY[
    'provider_name',
    'provider_address',
    'provider_phone',
    'provider_email',
    'logo_url',
    'letterhead_accent',
    'letterhead_style',
    'letterhead_footer_note'
  ]::text[])
  ORDER BY setting.key;
END;
$function$;

REVOKE ALL ON FUNCTION security_internal.get_report_letterhead_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION security_internal.get_report_letterhead_settings() TO authenticated;

-- Preserve the exposed SECURITY INVOKER wrapper and its existing grants.
CREATE OR REPLACE FUNCTION public.get_report_letterhead_settings()
RETURNS TABLE (key text, value text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $wrapper$
  SELECT * FROM security_internal.get_report_letterhead_settings();
$wrapper$;

REVOKE ALL ON FUNCTION public.get_report_letterhead_settings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_report_letterhead_settings() TO authenticated;

COMMENT ON FUNCTION public.get_report_letterhead_settings() IS
  'SECURITY INVOKER wrapper for the private document-reader helper; returns only approved branding fields.';
COMMENT ON FUNCTION security_internal.get_report_letterhead_settings() IS
  'Returns approved company letterhead fields to users with reports.read, ledger.read, claims.read or preauth.read; never exposes general system settings.';
