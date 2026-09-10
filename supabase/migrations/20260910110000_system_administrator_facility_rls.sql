-- Complete the system-administrator access model at the facility boundary.
-- Admin/superuser roles must be able to discover and operate every active facility
-- without requiring a facility membership of their own.

DROP POLICY IF EXISTS facilities_select_member ON public.facilities;
CREATE POLICY facilities_select_member ON public.facilities
  FOR SELECT TO authenticated
  USING (
    security_internal.current_user_has_any_role(
      ARRAY['superuser','admin']::public.app_role[]
    )
    OR EXISTS (
      SELECT 1
      FROM public.facility_memberships fm
      WHERE fm.facility_id = facilities.id
        AND fm.user_id = (select auth.uid())
        AND fm.status = 'active'
    )
  );

DROP POLICY IF EXISTS facility_memberships_select_member ON public.facility_memberships;
CREATE POLICY facility_memberships_select_member ON public.facility_memberships
  FOR SELECT TO authenticated
  USING (
    security_internal.current_user_has_any_role(
      ARRAY['superuser','admin']::public.app_role[]
    )
    OR user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.facility_memberships own
      WHERE own.facility_id = facility_memberships.facility_id
        AND own.user_id = (select auth.uid())
        AND own.status = 'active'
        AND own.role IN ('owner','admin','manager')
    )
  );

COMMENT ON POLICY facilities_select_member ON public.facilities IS
  'Active facility members and system administrators may discover facilities; administrators are not constrained by facility membership.';
COMMENT ON POLICY facility_memberships_select_member ON public.facility_memberships IS
  'Users can inspect their memberships, facility managers can inspect their facility, and system administrators can inspect all memberships.';
