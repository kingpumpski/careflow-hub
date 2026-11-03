-- Restore browser-callable execution for authorization helpers while keeping
-- security-definer functions locked to authenticated users and explicit search_path.
-- System administrators retain global authority over permissions and facilities.

CREATE OR REPLACE FUNCTION public.current_user_has_any_role(p_roles public.app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role = ANY(p_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_permission(p_permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role = ANY(ARRAY['superuser'::public.app_role, 'admin'::public.app_role])
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_permission_overrides uo
    WHERE uo.user_id = (SELECT auth.uid())
      AND uo.permission_key = p_permission_key
      AND uo.allowed = true
  )
  OR (
    NOT EXISTS (
      SELECT 1
      FROM public.user_permission_overrides uo
      WHERE uo.user_id = (SELECT auth.uid())
        AND uo.permission_key = p_permission_key
    )
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role = ur.role
      WHERE ur.user_id = (SELECT auth.uid())
        AND rp.permission_key = p_permission_key
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_facility_access(p_facility_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role = ANY(ARRAY['superuser'::public.app_role, 'admin'::public.app_role])
  )
  OR EXISTS (
    SELECT 1
    FROM public.facility_memberships fm
    WHERE fm.facility_id = p_facility_id
      AND fm.user_id = (SELECT auth.uid())
      AND fm.status = 'active'
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_has_any_role(public.app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_facility_access(uuid) TO authenticated;
