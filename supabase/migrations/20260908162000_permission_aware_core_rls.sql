-- Enforce the database-backed permission model at the RLS boundary.
-- Role membership remains the baseline, while explicit per-user overrides now
-- control the effective permission set. Destructive deletes remain admin/superuser
-- actions because the permission catalogue intentionally has no generic delete grant.

CREATE OR REPLACE FUNCTION public.current_user_has_permission(p_permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.user_permission_overrides uo
        WHERE uo.user_id = (select auth.uid())
          AND uo.permission_key = p_permission_key
      ) THEN EXISTS (
        SELECT 1
        FROM public.user_permission_overrides uo
        WHERE uo.user_id = (select auth.uid())
          AND uo.permission_key = p_permission_key
          AND uo.granted = true
      )
      ELSE EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.role_permissions rp
          ON rp.role = ur.role::text
         AND rp.permission_key = p_permission_key
         AND rp.granted = true
        WHERE ur.user_id = (select auth.uid())
      )
    END;
$$;

REVOKE ALL ON FUNCTION public.current_user_has_permission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_permission(text) TO authenticated;

-- Remove the previous role-only policies from the protected operational surface.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'insurance_companies', 'client_companies', 'doctors', 'procedures',
        'patients', 'pre_authorizations', 'preauth_items', 'claims',
        'payments', 'withholding_tax'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Read access is facility-scoped and permission-scoped.
CREATE POLICY insurance_companies_permission_select ON public.insurance_companies
  FOR SELECT TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_permission('masterdata.write')
  );
CREATE POLICY client_companies_permission_select ON public.client_companies
  FOR SELECT TO authenticated USING (
    public.core_facility_access(facility_id)
    AND (public.current_user_has_permission('masterdata.write') OR public.current_user_has_permission('claims.read'))
  );
CREATE POLICY doctors_permission_select ON public.doctors
  FOR SELECT TO authenticated USING (
    public.core_facility_access(facility_id)
    AND (public.current_user_has_permission('masterdata.write') OR public.current_user_has_permission('preauth.read') OR public.current_user_has_permission('claims.read'))
  );
CREATE POLICY procedures_permission_select ON public.procedures
  FOR SELECT TO authenticated USING (
    public.core_facility_access(facility_id)
    AND (public.current_user_has_permission('masterdata.write') OR public.current_user_has_permission('preauth.read') OR public.current_user_has_permission('claims.read'))
  );
CREATE POLICY patients_permission_select ON public.patients
  FOR SELECT TO authenticated USING (
    public.core_facility_access(facility_id)
    AND (public.current_user_has_permission('claims.read') OR public.current_user_has_permission('preauth.read'))
  );
CREATE POLICY pre_authorizations_permission_select ON public.pre_authorizations
  FOR SELECT TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_permission('preauth.read')
  );
CREATE POLICY preauth_items_permission_select ON public.preauth_items
  FOR SELECT TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_permission('preauth.read')
  );
CREATE POLICY claims_permission_select ON public.claims
  FOR SELECT TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_permission('claims.read')
  );
CREATE POLICY payments_permission_select ON public.payments
  FOR SELECT TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_permission('payments.read')
  );
CREATE POLICY withholding_tax_permission_select ON public.withholding_tax
  FOR SELECT TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_permission('payments.read')
  );

-- Master data writes.
CREATE POLICY insurance_companies_permission_insert ON public.insurance_companies
  FOR INSERT TO authenticated WITH CHECK (
    public.core_facility_access(facility_id)
    AND public.current_user_has_permission('masterdata.write')
  );
CREATE POLICY insurance_companies_permission_update ON public.insurance_companies
  FOR UPDATE TO authenticated USING (
    public.core_facility_access(facility_id) AND public.current_user_has_permission('masterdata.write')
  ) WITH CHECK (
    public.core_facility_access(facility_id) AND public.current_user_has_permission('masterdata.write')
  );
CREATE POLICY insurance_companies_admin_delete ON public.insurance_companies
  FOR DELETE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

CREATE POLICY client_companies_permission_insert ON public.client_companies
  FOR INSERT TO authenticated WITH CHECK (
    public.core_facility_access(facility_id) AND public.current_user_has_permission('masterdata.write')
  );
CREATE POLICY client_companies_permission_update ON public.client_companies
  FOR UPDATE TO authenticated USING (
    public.core_facility_access(facility_id) AND public.current_user_has_permission('masterdata.write')
  ) WITH CHECK (
    public.core_facility_access(facility_id) AND public.current_user_has_permission('masterdata.write')
  );
CREATE POLICY client_companies_admin_delete ON public.client_companies
  FOR DELETE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

CREATE POLICY doctors_permission_insert ON public.doctors
  FOR INSERT TO authenticated WITH CHECK (
    public.core_facility_access(facility_id) AND public.current_user_has_permission('masterdata.write')
  );
CREATE POLICY doctors_permission_update ON public.doctors
  FOR UPDATE TO authenticated USING (
    public.core_facility_access(facility_id) AND public.current_user_has_permission('masterdata.write')
  ) WITH CHECK (
    public.core_facility_access(facility_id) AND public.current_user_has_permission('masterdata.write')
  );
CREATE POLICY doctors_admin_delete ON public.doctors
  FOR DELETE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

CREATE POLICY procedures_permission_insert ON public.procedures
  FOR INSERT TO authenticated WITH CHECK (
    public.core_facility_access(facility_id) AND public.current_user_has_permission('masterdata.write')
  );
CREATE POLICY procedures_permission_update ON public.procedures
  FOR UPDATE TO authenticated USING (
    public.core_facility_access(facility_id) AND public.current_user_has_permission('masterdata.write')
  ) WITH CHECK (
    public.core_facility_access(facility_id) AND public.current_user_has_permission('masterdata.write')
  );
CREATE POLICY procedures_admin_delete ON public.procedures
  FOR DELETE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

CREATE POLICY patients_permission_insert ON public.patients
  FOR INSERT TO authenticated WITH CHECK (
    public.core_facility_access(facility_id)
    AND (public.current_user_has_permission('claims.write') OR public.current_user_has_permission('preauth.write'))
  );
CREATE POLICY patients_permission_update ON public.patients
  FOR UPDATE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND (public.current_user_has_permission('claims.write') OR public.current_user_has_permission('preauth.write'))
  ) WITH CHECK (
    public.core_facility_access(facility_id)
    AND (public.current_user_has_permission('claims.write') OR public.current_user_has_permission('preauth.write'))
  );
CREATE POLICY patients_admin_delete ON public.patients
  FOR DELETE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

-- Pre-authorization preparation.
CREATE POLICY pre_authorizations_permission_insert ON public.pre_authorizations
  FOR INSERT TO authenticated WITH CHECK (
    public.core_facility_access(facility_id)
    AND created_by = (select auth.uid())
    AND public.current_user_has_permission('preauth.write')
  );
CREATE POLICY pre_authorizations_permission_update ON public.pre_authorizations
  FOR UPDATE TO authenticated USING (
    public.core_facility_access(facility_id) AND public.current_user_has_permission('preauth.write')
  ) WITH CHECK (
    public.core_facility_access(facility_id) AND public.current_user_has_permission('preauth.write')
  );
CREATE POLICY pre_authorizations_admin_delete ON public.pre_authorizations
  FOR DELETE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

CREATE POLICY preauth_items_permission_insert ON public.preauth_items
  FOR INSERT TO authenticated WITH CHECK (
    public.core_facility_access(facility_id) AND public.current_user_has_permission('preauth.write')
  );
CREATE POLICY preauth_items_permission_update ON public.preauth_items
  FOR UPDATE TO authenticated USING (
    public.core_facility_access(facility_id) AND public.current_user_has_permission('preauth.write')
  ) WITH CHECK (
    public.core_facility_access(facility_id) AND public.current_user_has_permission('preauth.write')
  );
CREATE POLICY preauth_items_admin_delete ON public.preauth_items
  FOR DELETE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

-- Claims operations.
CREATE POLICY claims_permission_insert ON public.claims
  FOR INSERT TO authenticated WITH CHECK (
    public.core_facility_access(facility_id) AND public.current_user_has_permission('claims.write')
  );
CREATE POLICY claims_permission_update ON public.claims
  FOR UPDATE TO authenticated USING (
    public.core_facility_access(facility_id) AND public.current_user_has_permission('claims.write')
  ) WITH CHECK (
    public.core_facility_access(facility_id) AND public.current_user_has_permission('claims.write')
  );
CREATE POLICY claims_admin_delete ON public.claims
  FOR DELETE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

-- Finance operations.
CREATE POLICY payments_permission_insert ON public.payments
  FOR INSERT TO authenticated WITH CHECK (
    public.core_facility_access(facility_id) AND public.current_user_has_permission('payments.write')
  );
CREATE POLICY payments_permission_update ON public.payments
  FOR UPDATE TO authenticated USING (
    public.core_facility_access(facility_id) AND public.current_user_has_permission('payments.write')
  ) WITH CHECK (
    public.core_facility_access(facility_id) AND public.current_user_has_permission('payments.write')
  );
CREATE POLICY payments_admin_delete ON public.payments
  FOR DELETE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

CREATE POLICY withholding_tax_permission_insert ON public.withholding_tax
  FOR INSERT TO authenticated WITH CHECK (
    public.core_facility_access(facility_id) AND public.current_user_has_permission('payments.write')
  );
CREATE POLICY withholding_tax_permission_update ON public.withholding_tax
  FOR UPDATE TO authenticated USING (
    public.core_facility_access(facility_id) AND public.current_user_has_permission('payments.write')
  ) WITH CHECK (
    public.core_facility_access(facility_id) AND public.current_user_has_permission('payments.write')
  );
CREATE POLICY withholding_tax_admin_delete ON public.withholding_tax
  FOR DELETE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

COMMENT ON FUNCTION public.current_user_has_permission(text) IS
  'RLS permission helper. Explicit user overrides take precedence over role defaults.';
