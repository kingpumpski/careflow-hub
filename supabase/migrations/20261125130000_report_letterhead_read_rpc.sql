-- Let authorized report users render the configured company letterhead
-- without granting them broad read access to system_settings.
-- The exposed RPC is SECURITY INVOKER; only the private helper receives
-- SECURITY DEFINER privileges and it independently checks reports.read.
CREATE OR REPLACE FUNCTION security_internal.get_report_letterhead_settings()
RETURNS TABLE (key text, value text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT security_internal.current_user_has_permission('reports.read') THEN
    RAISE EXCEPTION 'Report access is required to read letterhead settings' USING ERRCODE = '42501';
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
  'SECURITY INVOKER wrapper for the private reports.read-checked letterhead reader; does not expose general system settings.';
COMMENT ON FUNCTION security_internal.get_report_letterhead_settings() IS
  'Returns only approved company letterhead fields to users with reports.read; does not expose general system settings.';
