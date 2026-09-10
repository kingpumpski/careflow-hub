-- System administrators have global facility visibility. Facility membership remains
-- the tenant boundary for ordinary users, while admin/superuser roles operate globally.

DROP POLICY IF EXISTS facilities_select_member ON public.facilities;
CREATE POLICY facilities_select_member ON public.facilities
  FOR SELECT TO authenticated
  USING (
    public.user_has_facility_access(facilities.id)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('superuser', 'admin')
    )
  );

-- Administrators must also be able to inspect facility memberships when assisting
-- users, without weakening ordinary users' membership visibility boundary.
DROP POLICY IF EXISTS facility_memberships_select_member ON public.facility_memberships;
CREATE POLICY facility_memberships_select_member ON public.facility_memberships
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR public.user_has_facility_access(facility_memberships.facility_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('superuser', 'admin')
    )
  );
