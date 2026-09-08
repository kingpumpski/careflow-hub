-- Consolidate the core RLS surface after facility tenancy hardening.
-- IMPORTANT: PostgreSQL combines permissive policies with OR semantics. Earlier
-- role-only policies would otherwise continue to grant access outside facility scope.
-- This migration removes every legacy policy on the protected operational tables
-- and recreates a single facility-scoped access model.

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

-- All authenticated members may read records belonging to a facility they can access.
CREATE POLICY insurance_companies_facility_select ON public.insurance_companies
  FOR SELECT TO authenticated USING (public.core_facility_access(facility_id));
CREATE POLICY client_companies_facility_select ON public.client_companies
  FOR SELECT TO authenticated USING (public.core_facility_access(facility_id));
CREATE POLICY doctors_facility_select ON public.doctors
  FOR SELECT TO authenticated USING (public.core_facility_access(facility_id));
CREATE POLICY procedures_facility_select ON public.procedures
  FOR SELECT TO authenticated USING (public.core_facility_access(facility_id));
CREATE POLICY patients_facility_select ON public.patients
  FOR SELECT TO authenticated USING (public.core_facility_access(facility_id));
CREATE POLICY pre_authorizations_facility_select ON public.pre_authorizations
  FOR SELECT TO authenticated USING (public.core_facility_access(facility_id));
CREATE POLICY preauth_items_facility_select ON public.preauth_items
  FOR SELECT TO authenticated USING (public.core_facility_access(facility_id));
CREATE POLICY claims_facility_select ON public.claims
  FOR SELECT TO authenticated USING (public.core_facility_access(facility_id));
CREATE POLICY payments_facility_select ON public.payments
  FOR SELECT TO authenticated USING (public.core_facility_access(facility_id));
CREATE POLICY withholding_tax_facility_select ON public.withholding_tax
  FOR SELECT TO authenticated USING (public.core_facility_access(facility_id));

-- Master/reference data is maintained by administrators, claims officers and data entry staff.
CREATE POLICY insurance_companies_staff_insert ON public.insurance_companies
  FOR INSERT TO authenticated WITH CHECK (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
  );
CREATE POLICY insurance_companies_staff_update ON public.insurance_companies
  FOR UPDATE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
  ) WITH CHECK (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
  );
CREATE POLICY insurance_companies_admin_delete ON public.insurance_companies
  FOR DELETE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

CREATE POLICY client_companies_staff_insert ON public.client_companies
  FOR INSERT TO authenticated WITH CHECK (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
  );
CREATE POLICY client_companies_staff_update ON public.client_companies
  FOR UPDATE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
  ) WITH CHECK (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
  );
CREATE POLICY client_companies_admin_delete ON public.client_companies
  FOR DELETE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

CREATE POLICY doctors_staff_insert ON public.doctors
  FOR INSERT TO authenticated WITH CHECK (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
  );
CREATE POLICY doctors_staff_update ON public.doctors
  FOR UPDATE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
  ) WITH CHECK (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
  );
CREATE POLICY doctors_admin_delete ON public.doctors
  FOR DELETE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

CREATE POLICY procedures_staff_insert ON public.procedures
  FOR INSERT TO authenticated WITH CHECK (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
  );
CREATE POLICY procedures_staff_update ON public.procedures
  FOR UPDATE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
  ) WITH CHECK (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
  );
CREATE POLICY procedures_admin_delete ON public.procedures
  FOR DELETE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

CREATE POLICY patients_staff_insert ON public.patients
  FOR INSERT TO authenticated WITH CHECK (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
  );
CREATE POLICY patients_staff_update ON public.patients
  FOR UPDATE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
  ) WITH CHECK (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
  );
CREATE POLICY patients_admin_delete ON public.patients
  FOR DELETE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

-- Pre-authorization data entry is intentionally available to claims/data-entry staff.
CREATE POLICY pre_authorizations_staff_insert ON public.pre_authorizations
  FOR INSERT TO authenticated WITH CHECK (
    public.core_facility_access(facility_id)
    AND created_by = (select auth.uid())
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
  );
CREATE POLICY pre_authorizations_staff_update ON public.pre_authorizations
  FOR UPDATE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
  ) WITH CHECK (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
  );
CREATE POLICY pre_authorizations_admin_delete ON public.pre_authorizations
  FOR DELETE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

CREATE POLICY preauth_items_staff_insert ON public.preauth_items
  FOR INSERT TO authenticated WITH CHECK (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
  );
CREATE POLICY preauth_items_staff_update ON public.preauth_items
  FOR UPDATE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
  ) WITH CHECK (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
  );
CREATE POLICY preauth_items_admin_delete ON public.preauth_items
  FOR DELETE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

-- Claims capture: claims/data-entry staff may create; claims/accounting staff may amend;
-- deletion remains an administrative action so reporting history is not casually destroyed.
CREATE POLICY claims_staff_insert ON public.claims
  FOR INSERT TO authenticated WITH CHECK (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
  );
CREATE POLICY claims_staff_update ON public.claims
  FOR UPDATE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','accounts_officer']::public.app_role[])
  ) WITH CHECK (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','accounts_officer']::public.app_role[])
  );
CREATE POLICY claims_admin_delete ON public.claims
  FOR DELETE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

CREATE POLICY payments_accounts_insert ON public.payments
  FOR INSERT TO authenticated WITH CHECK (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','accounts_officer']::public.app_role[])
  );
CREATE POLICY payments_accounts_update ON public.payments
  FOR UPDATE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','accounts_officer']::public.app_role[])
  ) WITH CHECK (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','accounts_officer']::public.app_role[])
  );
CREATE POLICY payments_admin_delete ON public.payments
  FOR DELETE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

CREATE POLICY withholding_tax_accounts_insert ON public.withholding_tax
  FOR INSERT TO authenticated WITH CHECK (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','accounts_officer']::public.app_role[])
  );
CREATE POLICY withholding_tax_accounts_update ON public.withholding_tax
  FOR UPDATE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','accounts_officer']::public.app_role[])
  ) WITH CHECK (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','accounts_officer']::public.app_role[])
  );
CREATE POLICY withholding_tax_admin_delete ON public.withholding_tax
  FOR DELETE TO authenticated USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

REVOKE ALL ON TABLE public.insurance_companies, public.client_companies, public.doctors,
  public.procedures, public.patients, public.pre_authorizations, public.preauth_items,
  public.claims, public.payments, public.withholding_tax FROM anon;

COMMENT ON TABLE public.claims IS 'Internal claims operations ledger. Access is facility-scoped and role-controlled; reporting should read this governed dataset.';
COMMENT ON TABLE public.preauthorizations IS 'Internal pre-authorization workflow source. Facility-scoped and role-controlled for operational use.';
