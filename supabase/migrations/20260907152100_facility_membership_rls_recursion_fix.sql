-- Facility membership SELECT policy must not query facility_memberships itself;
-- doing so would recurse through RLS. Administrative membership management is
-- intentionally deferred to a dedicated SECURITY DEFINER function.
DROP POLICY IF EXISTS facility_memberships_select_member ON public.facility_memberships;
CREATE POLICY facility_memberships_select_member ON public.facility_memberships
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) AND status = 'active');
