-- Restore EXECUTE privileges required by legacy/public RLS policies.
-- These SECURITY DEFINER helpers remain unavailable to anon; authenticated users
-- need execution rights because several existing policies still call the public
-- wrappers directly. The wrappers retain their role-authoritative implementation.

GRANT EXECUTE ON FUNCTION public.current_user_has_permission(text)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.current_user_has_any_role(public.app_role[])
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.user_has_facility_access(uuid)
  TO authenticated;
