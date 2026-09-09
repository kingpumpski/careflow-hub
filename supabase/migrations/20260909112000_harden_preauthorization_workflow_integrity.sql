-- Harden preauthorization workflow evidence and document registry.
-- Document registry is writable only by preauth writers in the same facility.
DROP POLICY IF EXISTS preauth_document_registry_insert ON public.preauth_document_registry;
CREATE POLICY preauth_document_registry_insert ON public.preauth_document_registry
FOR INSERT TO authenticated
WITH CHECK (
  security_internal.current_user_has_permission('preauth.write')
  AND created_by = (SELECT auth.uid())
  AND facility_id IS NOT NULL
  AND security_internal.user_has_facility_access(facility_id)
  AND EXISTS (
    SELECT 1 FROM public.pre_authorizations p
    WHERE p.id = preauth_document_registry.preauth_id
      AND p.facility_id = preauth_document_registry.facility_id
  )
);

DROP POLICY IF EXISTS preauth_document_registry_update ON public.preauth_document_registry;
CREATE POLICY preauth_document_registry_update ON public.preauth_document_registry
FOR UPDATE TO authenticated
USING (security_internal.current_user_has_permission('preauth.write') AND security_internal.user_has_facility_access(facility_id))
WITH CHECK (security_internal.current_user_has_permission('preauth.write') AND security_internal.user_has_facility_access(facility_id));

DROP POLICY IF EXISTS preauth_document_registry_delete ON public.preauth_document_registry;
CREATE POLICY preauth_document_registry_delete ON public.preauth_document_registry
FOR DELETE TO authenticated
USING (security_internal.current_user_has_any_role(ARRAY['superuser'::app_role, 'admin'::app_role]) AND security_internal.current_user_has_permission('preauth.write') AND security_internal.user_has_facility_access(facility_id));

-- Submission records may be retried/updated only by writers in their facility.
DROP POLICY IF EXISTS preauth_submissions_update_permission ON public.preauth_submissions;
CREATE POLICY preauth_submissions_update_permission ON public.preauth_submissions
FOR UPDATE TO authenticated
USING (security_internal.current_user_has_permission('preauth.write') AND facility_id IS NOT NULL AND security_internal.user_has_facility_access(facility_id))
WITH CHECK (security_internal.current_user_has_permission('preauth.write') AND facility_id IS NOT NULL AND security_internal.user_has_facility_access(facility_id));

DROP POLICY IF EXISTS preauth_submissions_delete_admin ON public.preauth_submissions;
CREATE POLICY preauth_submissions_delete_admin ON public.preauth_submissions
FOR DELETE TO authenticated
USING (security_internal.current_user_has_any_role(ARRAY['superuser'::app_role, 'admin'::app_role]) AND security_internal.current_user_has_permission('preauth.write') AND facility_id IS NOT NULL AND security_internal.user_has_facility_access(facility_id));

-- Version snapshots are audit evidence; permit controlled writes but no ordinary deletion.
DROP POLICY IF EXISTS preauth_versions_update_permission ON public.preauth_versions;
CREATE POLICY preauth_versions_update_permission ON public.preauth_versions
FOR UPDATE TO authenticated
USING (security_internal.current_user_has_permission('preauth.write') AND EXISTS (SELECT 1 FROM public.pre_authorizations p WHERE p.id = preauth_versions.preauth_id AND p.facility_id IS NOT NULL AND security_internal.user_has_facility_access(p.facility_id)))
WITH CHECK (security_internal.current_user_has_permission('preauth.write') AND EXISTS (SELECT 1 FROM public.pre_authorizations p WHERE p.id = preauth_versions.preauth_id AND p.facility_id IS NOT NULL AND security_internal.user_has_facility_access(p.facility_id)));

DROP POLICY IF EXISTS preauth_versions_delete_admin ON public.preauth_versions;
CREATE POLICY preauth_versions_delete_admin ON public.preauth_versions
FOR DELETE TO authenticated
USING (security_internal.current_user_has_any_role(ARRAY['superuser'::app_role, 'admin'::app_role]) AND security_internal.current_user_has_permission('preauth.write') AND EXISTS (SELECT 1 FROM public.pre_authorizations p WHERE p.id = preauth_versions.preauth_id AND p.facility_id IS NOT NULL AND security_internal.user_has_facility_access(p.facility_id)));

-- The newer version ledger is append-only evidence.
DROP POLICY IF EXISTS preauthorization_versions_insert_permission ON public.preauthorization_versions;
CREATE POLICY preauthorization_versions_insert_permission ON public.preauthorization_versions
FOR INSERT TO authenticated
WITH CHECK (security_internal.current_user_has_permission('preauth.write') AND created_by = (SELECT auth.uid()) AND facility_id IS NOT NULL AND security_internal.user_has_facility_access(facility_id) AND EXISTS (SELECT 1 FROM public.pre_authorizations p WHERE p.id = preauthorization_versions.preauth_id AND p.facility_id = preauthorization_versions.facility_id));

DROP POLICY IF EXISTS preauthorization_versions_update_permission ON public.preauthorization_versions;
CREATE POLICY preauthorization_versions_update_permission ON public.preauthorization_versions FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS preauthorization_versions_delete_permission ON public.preauthorization_versions;
CREATE POLICY preauthorization_versions_delete_permission ON public.preauthorization_versions FOR DELETE TO authenticated USING (false);

-- Handoff and email logs are immutable operational evidence.
DROP POLICY IF EXISTS preauth_handoff_log_update ON public.preauth_handoff_log;
CREATE POLICY preauth_handoff_log_update ON public.preauth_handoff_log FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS preauth_handoff_log_delete ON public.preauth_handoff_log;
CREATE POLICY preauth_handoff_log_delete ON public.preauth_handoff_log FOR DELETE TO authenticated USING (false);
DROP POLICY IF EXISTS preauth_email_log_update ON public.preauth_email_log;
CREATE POLICY preauth_email_log_update ON public.preauth_email_log FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS preauth_email_log_delete ON public.preauth_email_log;
CREATE POLICY preauth_email_log_delete ON public.preauth_email_log FOR DELETE TO authenticated USING (false);