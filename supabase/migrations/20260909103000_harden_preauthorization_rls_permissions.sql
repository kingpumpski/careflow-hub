-- Tighten pre-authorization data boundaries: facility scope + explicit module permissions.
DROP POLICY IF EXISTS pre_authorizations_select_facility ON public.pre_authorizations;
CREATE POLICY pre_authorizations_select_permission ON public.pre_authorizations
FOR SELECT TO authenticated
USING (
  facility_id IS NOT NULL
  AND security_internal.user_has_facility_access(facility_id)
  AND security_internal.current_user_has_permission('preauth.read')
);

-- Allow item deletion only to writers within the parent facility.
DROP POLICY IF EXISTS preauth_items_delete_permission ON public.preauth_items;
CREATE POLICY preauth_items_delete_permission ON public.preauth_items
FOR DELETE TO authenticated
USING (
  security_internal.current_user_has_permission('preauth.write')
  AND EXISTS (
    SELECT 1 FROM public.pre_authorizations p
    WHERE p.id = preauth_items.preauth_id
      AND p.facility_id IS NOT NULL
      AND security_internal.user_has_facility_access(p.facility_id)
  )
);

-- Version/history and submission records are append-only operational records.
CREATE POLICY preauth_versions_insert_permission ON public.preauth_versions
FOR INSERT TO authenticated
WITH CHECK (
  security_internal.current_user_has_permission('preauth.write')
  AND EXISTS (
    SELECT 1 FROM public.pre_authorizations p
    WHERE p.id = preauth_versions.preauth_id
      AND p.facility_id IS NOT NULL
      AND security_internal.user_has_facility_access(p.facility_id)
  )
);

CREATE POLICY preauth_submissions_insert_permission ON public.preauth_submissions
FOR INSERT TO authenticated
WITH CHECK (
  security_internal.current_user_has_permission('preauth.write')
  AND EXISTS (
    SELECT 1 FROM public.pre_authorizations p
    WHERE p.id = preauth_submissions.preauth_id
      AND p.facility_id IS NOT NULL
      AND security_internal.user_has_facility_access(p.facility_id)
  )
);

CREATE POLICY preauth_handoff_log_insert_permission ON public.preauth_handoff_log
FOR INSERT TO authenticated
WITH CHECK (
  security_internal.current_user_has_permission('preauth.read')
  AND prepared_by = auth.uid()
  AND security_internal.user_has_facility_access(facility_id)
);

CREATE POLICY preauth_email_log_insert_permission ON public.preauth_email_log
FOR INSERT TO authenticated
WITH CHECK (
  security_internal.current_user_has_permission('preauth.read')
  AND attempted_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.pre_authorizations p
    WHERE p.id = preauth_email_log.preauth_id
      AND p.facility_id IS NOT NULL
      AND security_internal.user_has_facility_access(p.facility_id)
  )
);

-- Catalog is shared master data, so protect mutations with masterdata.write.
DROP POLICY IF EXISTS "Authenticated insert preauth_catalog_items" ON public.preauth_catalog_items;
DROP POLICY IF EXISTS "Authenticated update preauth_catalog_items" ON public.preauth_catalog_items;
DROP POLICY IF EXISTS "Authenticated delete preauth_catalog_items" ON public.preauth_catalog_items;
DROP POLICY IF EXISTS "Authenticated read preauth_catalog_items" ON public.preauth_catalog_items;
CREATE POLICY preauth_catalog_items_select ON public.preauth_catalog_items
FOR SELECT TO authenticated
USING (
  security_internal.current_user_has_permission('preauth.read')
  OR security_internal.current_user_has_permission('masterdata.write')
);
CREATE POLICY preauth_catalog_items_insert ON public.preauth_catalog_items
FOR INSERT TO authenticated
WITH CHECK (security_internal.current_user_has_permission('masterdata.write'));
CREATE POLICY preauth_catalog_items_update ON public.preauth_catalog_items
FOR UPDATE TO authenticated
USING (security_internal.current_user_has_permission('masterdata.write'))
WITH CHECK (security_internal.current_user_has_permission('masterdata.write'));
CREATE POLICY preauth_catalog_items_delete ON public.preauth_catalog_items
FOR DELETE TO authenticated
USING (
  security_internal.current_user_has_any_role(ARRAY['superuser'::app_role, 'admin'::app_role])
  AND security_internal.current_user_has_permission('masterdata.write')
);
