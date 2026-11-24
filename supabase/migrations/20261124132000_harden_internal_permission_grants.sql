-- Align the private RLS helper with the effective permission model.
-- Superuser/admin remain authoritative; explicit user overrides take precedence;
-- role-derived grants are effective only when the role_permissions row is granted.
CREATE OR REPLACE FUNCTION security_internal.current_user_has_permission(p_permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    security_internal.current_user_has_any_role(
      ARRAY['superuser', 'admin']::public.app_role[]
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_permission_overrides AS uo
      WHERE uo.user_id = (SELECT auth.uid())
        AND uo.permission_key = p_permission_key
        AND uo.granted = true
    )
    OR (
      NOT EXISTS (
        SELECT 1
        FROM public.user_permission_overrides AS uo
        WHERE uo.user_id = (SELECT auth.uid())
          AND uo.permission_key = p_permission_key
      )
      AND EXISTS (
        SELECT 1
        FROM public.user_roles AS ur
        JOIN public.role_permissions AS rp
          ON rp.role = ur.role::TEXT
        WHERE ur.user_id = (SELECT auth.uid())
          AND rp.permission_key = p_permission_key
          AND rp.granted = true
      )
    );
$$;

REVOKE ALL ON FUNCTION security_internal.current_user_has_permission(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION security_internal.current_user_has_permission(TEXT) TO authenticated;

COMMENT ON FUNCTION security_internal.current_user_has_permission(TEXT) IS
  'Returns effective permission; superuser/admin are globally authoritative, explicit overrides take precedence, and role-derived grants require granted=true.';
