-- Replace broad authenticated read policies for Pre-Authorization support tables.
-- Historical rows without a facility remain visible only to their original actor until
-- a deployment backfills them into a facility; all new application writes require facility.

DROP POLICY IF EXISTS preauth_client_suggestions_select ON public.preauth_client_suggestions;
CREATE POLICY preauth_client_suggestions_select ON public.preauth_client_suggestions
  FOR SELECT TO authenticated
  USING (
    (facility_id IS NOT NULL AND public.user_has_facility_access(facility_id))
    OR (facility_id IS NULL AND created_by = (select auth.uid()))
  );
DROP POLICY IF EXISTS preauth_client_suggestions_insert ON public.preauth_client_suggestions;
CREATE POLICY preauth_client_suggestions_insert ON public.preauth_client_suggestions
  FOR INSERT TO authenticated
  WITH CHECK (facility_id IS NOT NULL AND public.user_has_facility_access(facility_id) AND created_by = (select auth.uid()));
DROP POLICY IF EXISTS preauth_client_suggestions_update ON public.preauth_client_suggestions;
CREATE POLICY preauth_client_suggestions_update ON public.preauth_client_suggestions
  FOR UPDATE TO authenticated
  USING (facility_id IS NOT NULL AND public.user_has_facility_access(facility_id))
  WITH CHECK (facility_id IS NOT NULL AND public.user_has_facility_access(facility_id));

DROP POLICY IF EXISTS preauth_versions_select_authenticated ON public.preauthorization_versions;
CREATE POLICY preauth_versions_select_facility ON public.preauthorization_versions
  FOR SELECT TO authenticated
  USING (
    (facility_id IS NOT NULL AND public.user_has_facility_access(facility_id))
    OR (facility_id IS NULL AND created_by = (select auth.uid()))
  );

DROP POLICY IF EXISTS preauth_submissions_select_authenticated ON public.preauth_submissions;
CREATE POLICY preauth_submissions_select_facility ON public.preauth_submissions
  FOR SELECT TO authenticated
  USING (
    (facility_id IS NOT NULL AND public.user_has_facility_access(facility_id))
    OR (facility_id IS NULL AND submitted_by = (select auth.uid()))
  );

DROP POLICY IF EXISTS preauth_documents_select_authenticated ON public.preauth_documents;
CREATE POLICY preauth_documents_select_facility ON public.preauth_documents
  FOR SELECT TO authenticated
  USING (
    (facility_id IS NOT NULL AND public.user_has_facility_access(facility_id))
    OR (facility_id IS NULL AND generated_by = (select auth.uid()))
  );

DROP POLICY IF EXISTS preauth_audit_events_select_authenticated ON public.preauth_audit_events;
CREATE POLICY preauth_audit_events_select_facility ON public.preauth_audit_events
  FOR SELECT TO authenticated
  USING (
    (facility_id IS NOT NULL AND public.user_has_facility_access(facility_id))
    OR (facility_id IS NULL AND actor_id = (select auth.uid()))
  );

-- Pre-Authorization itself: facility members can read their facility; historical
-- unassigned records are restricted to their creator during migration/backfill.
ALTER TABLE public.pre_authorizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pre_authorizations_select_authenticated ON public.pre_authorizations;
DROP POLICY IF EXISTS pre_authorizations_select ON public.pre_authorizations;
CREATE POLICY pre_authorizations_select_facility ON public.pre_authorizations
  FOR SELECT TO authenticated
  USING (
    (facility_id IS NOT NULL AND public.user_has_facility_access(facility_id))
    OR (facility_id IS NULL AND created_by = (select auth.uid()))
  );

REVOKE ALL ON TABLE public.facilities FROM anon;
REVOKE ALL ON TABLE public.facility_memberships FROM anon;
GRANT SELECT ON TABLE public.facilities, public.facility_memberships TO authenticated;
