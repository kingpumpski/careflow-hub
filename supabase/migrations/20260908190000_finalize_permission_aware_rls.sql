-- Finalize least-privilege RLS after the historical broad authenticated policies.
-- PostgreSQL combines permissive policies with OR semantics, so legacy policies
-- must be removed explicitly before the permission-aware policies can be trusted.

-- ---------- Core operational tables ----------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'insurance_companies', 'client_companies', 'doctors', 'procedures',
        'patients', 'claims', 'payments', 'withholding_tax'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END;
$$;

CREATE POLICY insurance_companies_select_permission
  ON public.insurance_companies FOR SELECT TO authenticated
  USING (public.current_user_has_permission('masterdata.write'));
CREATE POLICY insurance_companies_insert_permission
  ON public.insurance_companies FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_permission('masterdata.write'));
CREATE POLICY insurance_companies_update_permission
  ON public.insurance_companies FOR UPDATE TO authenticated
  USING (public.current_user_has_permission('masterdata.write'))
  WITH CHECK (public.current_user_has_permission('masterdata.write'));
CREATE POLICY insurance_companies_delete_admin
  ON public.insurance_companies FOR DELETE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[]));

CREATE POLICY client_companies_select_permission
  ON public.client_companies FOR SELECT TO authenticated
  USING (
    public.current_user_has_permission('masterdata.write')
    OR public.current_user_has_permission('claims.read')
  );
CREATE POLICY client_companies_insert_permission
  ON public.client_companies FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_permission('masterdata.write'));
CREATE POLICY client_companies_update_permission
  ON public.client_companies FOR UPDATE TO authenticated
  USING (public.current_user_has_permission('masterdata.write'))
  WITH CHECK (public.current_user_has_permission('masterdata.write'));
CREATE POLICY client_companies_delete_admin
  ON public.client_companies FOR DELETE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[]));

CREATE POLICY doctors_select_permission
  ON public.doctors FOR SELECT TO authenticated
  USING (
    public.current_user_has_permission('masterdata.write')
    OR public.current_user_has_permission('preauth.read')
    OR public.current_user_has_permission('claims.read')
  );
CREATE POLICY doctors_insert_permission
  ON public.doctors FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_permission('masterdata.write'));
CREATE POLICY doctors_update_permission
  ON public.doctors FOR UPDATE TO authenticated
  USING (public.current_user_has_permission('masterdata.write'))
  WITH CHECK (public.current_user_has_permission('masterdata.write'));
CREATE POLICY doctors_delete_admin
  ON public.doctors FOR DELETE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[]));

CREATE POLICY procedures_select_permission
  ON public.procedures FOR SELECT TO authenticated
  USING (
    public.current_user_has_permission('masterdata.write')
    OR public.current_user_has_permission('preauth.read')
    OR public.current_user_has_permission('claims.read')
  );
CREATE POLICY procedures_insert_permission
  ON public.procedures FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_permission('masterdata.write'));
CREATE POLICY procedures_update_permission
  ON public.procedures FOR UPDATE TO authenticated
  USING (public.current_user_has_permission('masterdata.write'))
  WITH CHECK (public.current_user_has_permission('masterdata.write'));
CREATE POLICY procedures_delete_admin
  ON public.procedures FOR DELETE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[]));

CREATE POLICY patients_select_permission
  ON public.patients FOR SELECT TO authenticated
  USING (
    public.current_user_has_permission('preauth.read')
    OR public.current_user_has_permission('claims.read')
  );
CREATE POLICY patients_insert_permission
  ON public.patients FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_has_permission('preauth.write')
    OR public.current_user_has_permission('claims.write')
  );
CREATE POLICY patients_update_permission
  ON public.patients FOR UPDATE TO authenticated
  USING (
    public.current_user_has_permission('preauth.write')
    OR public.current_user_has_permission('claims.write')
  )
  WITH CHECK (
    public.current_user_has_permission('preauth.write')
    OR public.current_user_has_permission('claims.write')
  );
CREATE POLICY patients_delete_admin
  ON public.patients FOR DELETE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[]));

CREATE POLICY claims_select_permission
  ON public.claims FOR SELECT TO authenticated
  USING (public.current_user_has_permission('claims.read'));
CREATE POLICY claims_insert_permission
  ON public.claims FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_permission('claims.write'));
CREATE POLICY claims_update_permission
  ON public.claims FOR UPDATE TO authenticated
  USING (public.current_user_has_permission('claims.write'))
  WITH CHECK (public.current_user_has_permission('claims.write'));
CREATE POLICY claims_delete_admin
  ON public.claims FOR DELETE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[]));

CREATE POLICY payments_select_permission
  ON public.payments FOR SELECT TO authenticated
  USING (public.current_user_has_permission('payments.read'));
CREATE POLICY payments_insert_permission
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_permission('payments.write'));
CREATE POLICY payments_update_permission
  ON public.payments FOR UPDATE TO authenticated
  USING (public.current_user_has_permission('payments.write'))
  WITH CHECK (public.current_user_has_permission('payments.write'));
CREATE POLICY payments_delete_admin
  ON public.payments FOR DELETE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[]));

CREATE POLICY withholding_tax_select_permission
  ON public.withholding_tax FOR SELECT TO authenticated
  USING (public.current_user_has_permission('payments.read'));
CREATE POLICY withholding_tax_insert_permission
  ON public.withholding_tax FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_permission('payments.write'));
CREATE POLICY withholding_tax_update_permission
  ON public.withholding_tax FOR UPDATE TO authenticated
  USING (public.current_user_has_permission('payments.write'))
  WITH CHECK (public.current_user_has_permission('payments.write'));
CREATE POLICY withholding_tax_delete_admin
  ON public.withholding_tax FOR DELETE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[]));

-- ---------- Pre-authorization lifecycle history ----------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('preauth_versions', 'preauthorization_versions', 'preauth_submissions', 'preauth_email_log')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END;
$$;

-- preauth_versions is retained as a legacy compatibility table. It is readable only
-- through the same pre-authorization facility boundary and cannot be mutated directly.
CREATE POLICY preauth_versions_select_scoped
  ON public.preauth_versions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.pre_authorizations p
    WHERE p.id = preauth_versions.preauth_id
      AND p.facility_id IS NOT NULL
      AND public.user_has_facility_access(p.facility_id)
      AND public.current_user_has_permission('preauth.read')
  ));
REVOKE INSERT, UPDATE, DELETE ON public.preauth_versions FROM authenticated, anon;

CREATE POLICY preauthorization_versions_select_scoped
  ON public.preauthorization_versions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.pre_authorizations p
    WHERE p.id = preauthorization_versions.preauth_id
      AND p.facility_id IS NOT NULL
      AND public.user_has_facility_access(p.facility_id)
      AND public.current_user_has_permission('preauth.read')
  ));
REVOKE INSERT, UPDATE, DELETE ON public.preauthorization_versions FROM authenticated, anon;

CREATE POLICY preauth_submissions_select_scoped
  ON public.preauth_submissions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.pre_authorizations p
    WHERE p.id = preauth_submissions.preauth_id
      AND p.facility_id IS NOT NULL
      AND public.user_has_facility_access(p.facility_id)
      AND public.current_user_has_permission('preauth.read')
  ));
REVOKE INSERT, UPDATE, DELETE ON public.preauth_submissions FROM authenticated, anon;

CREATE POLICY preauth_email_log_select_scoped
  ON public.preauth_email_log FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.pre_authorizations p
    WHERE p.id = preauth_email_log.preauth_id
      AND p.facility_id IS NOT NULL
      AND public.user_has_facility_access(p.facility_id)
      AND public.current_user_has_permission('preauth.read')
  ));
REVOKE INSERT, UPDATE, DELETE ON public.preauth_email_log FROM authenticated, anon;

COMMENT ON TABLE public.preauth_submissions IS
  'Historical request-preparation/handoff records only. External insurer submission execution is disabled.';
