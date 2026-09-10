-- Restore EXECUTE privileges required by authenticated RLS/policy evaluation.
-- SECURITY DEFINER keeps the helper's protected table access isolated while the
-- EXECUTE grant allows PostgREST/RLS to invoke the helper on behalf of a user.
-- System administrators remain role-authoritative inside the helper itself.

GRANT EXECUTE ON FUNCTION security_internal.current_user_has_permission(text)
  TO authenticated;

GRANT EXECUTE ON FUNCTION security_internal.current_user_has_any_role(public.app_role[])
  TO authenticated;

GRANT EXECUTE ON FUNCTION security_internal.user_has_facility_access(uuid)
  TO authenticated;

COMMENT ON FUNCTION security_internal.current_user_has_permission(text) IS
  'Effective permission helper for authenticated policy evaluation; superuser and admin roles are globally authoritative.';
