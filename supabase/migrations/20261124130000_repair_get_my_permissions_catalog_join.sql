-- Forward repair for environments where the historical permission RPC migration
-- has already been recorded. app_permissions uses "key", not "permission_key".
CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS TABLE(permission_key TEXT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT p.key
  FROM public.app_permissions AS p
  JOIN public.role_permissions AS rp
    ON rp.permission_key = p.key
  JOIN public.user_roles AS ur
    ON ur.role::TEXT = rp.role
  WHERE ur.user_id = (SELECT auth.uid())
  UNION
  SELECT uo.permission_key
  FROM public.user_permission_overrides AS uo
  WHERE uo.user_id = (SELECT auth.uid())
    AND uo.granted = true
  EXCEPT
  SELECT uo.permission_key
  FROM public.user_permission_overrides AS uo
  WHERE uo.user_id = (SELECT auth.uid())
    AND uo.granted = false;
$$;

REVOKE ALL ON FUNCTION public.get_my_permissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;
