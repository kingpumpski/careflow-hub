-- Internal SECURITY DEFINER preauthorization implementations are not Data API endpoints.
-- Keep only the helper functions needed by authenticated RLS policies callable by the client role.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA security_internal FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA security_internal FROM anon, authenticated;
REVOKE USAGE ON SCHEMA security_internal FROM PUBLIC;
REVOKE USAGE ON SCHEMA security_internal FROM anon, authenticated;

GRANT USAGE ON SCHEMA security_internal TO authenticated;
GRANT EXECUTE ON FUNCTION security_internal.current_user_has_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION security_internal.current_user_has_any_role(app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION security_internal.user_has_facility_access(uuid) TO authenticated;
