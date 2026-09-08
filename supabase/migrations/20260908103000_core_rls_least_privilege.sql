-- Core RLS least-privilege hardening.
-- The original schema granted every authenticated user unrestricted CRUD access
-- to sensitive medical/financial tables. PostgreSQL combines permissive policies
-- with OR semantics, so those legacy policies can bypass later restrictive intent.

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
    WHERE ur.user_id = (select auth.uid())
      AND ur.role = ANY (p_roles)
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_has_any_role(public.app_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_any_role(public.app_role[]) TO authenticated;

-- ---------- Pre-authorization request + charge rows ----------
DROP POLICY IF EXISTS "Authenticated read pre_authorizations" ON public.pre_authorizations;
DROP POLICY IF EXISTS "Authenticated insert pre_authorizations" ON public.pre_authorizations;
DROP POLICY IF EXISTS "Authenticated update pre_authorizations" ON public.pre_authorizations;
DROP POLICY IF EXISTS "Authenticated delete pre_authorizations" ON public.pre_authorizations;
DROP POLICY IF EXISTS pre_authorizations_select_facility ON public.pre_authorizations;

CREATE POLICY pre_authorizations_select_facility ON public.pre_authorizations
  FOR SELECT TO authenticated
  USING (
    (facility_id IS NOT NULL AND public.user_has_facility_access(facility_id))
    OR (facility_id IS NULL AND created_by = (select auth.uid()))
  );
CREATE POLICY pre_authorizations_insert_facility ON public.pre_authorizations
  FOR INSERT TO authenticated
  WITH CHECK (
    facility_id IS NOT NULL
    AND public.user_has_facility_access(facility_id)
    AND created_by = (select auth.uid())
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
  );
CREATE POLICY pre_authorizations_update_facility ON public.pre_authorizations
  FOR UPDATE TO authenticated
  USING (
    facility_id IS NOT NULL
    AND public.user_has_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
  )
  WITH CHECK (
    facility_id IS NOT NULL
    AND public.user_has_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
  );
CREATE POLICY pre_authorizations_delete_admin ON public.pre_authorizations
  FOR DELETE TO authenticated
  USING (
    facility_id IS NOT NULL
    AND public.user_has_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

DROP POLICY IF EXISTS "Authenticated read preauth_items" ON public.preauth_items;
DROP POLICY IF EXISTS "Authenticated insert preauth_items" ON public.preauth_items;
DROP POLICY IF EXISTS "Authenticated update preauth_items" ON public.preauth_items;
DROP POLICY IF EXISTS "Authenticated delete preauth_items" ON public.preauth_items;

CREATE POLICY preauth_items_select_facility ON public.preauth_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pre_authorizations p
    WHERE p.id = preauth_items.preauth_id
      AND ((p.facility_id IS NOT NULL AND public.user_has_facility_access(p.facility_id))
        OR (p.facility_id IS NULL AND p.created_by = (select auth.uid())))
  ));
CREATE POLICY preauth_items_insert_facility ON public.preauth_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
    AND EXISTS (
      SELECT 1 FROM public.pre_authorizations p
      WHERE p.id = preauth_items.preauth_id
        AND p.facility_id IS NOT NULL
        AND public.user_has_facility_access(p.facility_id)
    )
  );
CREATE POLICY preauth_items_update_facility ON public.preauth_items
  FOR UPDATE TO authenticated
  USING (
    public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
    AND EXISTS (
      SELECT 1 FROM public.pre_authorizations p
      WHERE p.id = preauth_items.preauth_id
        AND p.facility_id IS NOT NULL
        AND public.user_has_facility_access(p.facility_id)
    )
  )
  WITH CHECK (
    public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])
    AND EXISTS (
      SELECT 1 FROM public.pre_authorizations p
      WHERE p.id = preauth_items.preauth_id
        AND p.facility_id IS NOT NULL
        AND public.user_has_facility_access(p.facility_id)
    )
  );
CREATE POLICY preauth_items_delete_admin ON public.preauth_items
  FOR DELETE TO authenticated
  USING (
    public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
    AND EXISTS (
      SELECT 1 FROM public.pre_authorizations p
      WHERE p.id = preauth_items.preauth_id
        AND p.facility_id IS NOT NULL
        AND public.user_has_facility_access(p.facility_id)
    )
  );

-- ---------- Master data ----------
DROP POLICY IF EXISTS "Authenticated insert insurance_companies" ON public.insurance_companies;
DROP POLICY IF EXISTS "Authenticated update insurance_companies" ON public.insurance_companies;
DROP POLICY IF EXISTS "Authenticated delete insurance_companies" ON public.insurance_companies;
CREATE POLICY insurance_companies_insert_staff ON public.insurance_companies FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[]));
CREATE POLICY insurance_companies_update_staff ON public.insurance_companies FOR UPDATE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[]))
  WITH CHECK (public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[]));
CREATE POLICY insurance_companies_delete_admin ON public.insurance_companies FOR DELETE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[]));

DROP POLICY IF EXISTS "Authenticated insert client_companies" ON public.client_companies;
DROP POLICY IF EXISTS "Authenticated update client_companies" ON public.client_companies;
DROP POLICY IF EXISTS "Authenticated delete client_companies" ON public.client_companies;
CREATE POLICY client_companies_insert_staff ON public.client_companies FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[]));
CREATE POLICY client_companies_update_staff ON public.client_companies FOR UPDATE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[]))
  WITH CHECK (public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[]));
CREATE POLICY client_companies_delete_admin ON public.client_companies FOR DELETE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[]));

DROP POLICY IF EXISTS "Authenticated insert doctors" ON public.doctors;
DROP POLICY IF EXISTS "Authenticated update doctors" ON public.doctors;
DROP POLICY IF EXISTS "Authenticated delete doctors" ON public.doctors;
CREATE POLICY doctors_insert_staff ON public.doctors FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[]));
CREATE POLICY doctors_update_staff ON public.doctors FOR UPDATE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[]))
  WITH CHECK (public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[]));
CREATE POLICY doctors_delete_admin ON public.doctors FOR DELETE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[]));

DROP POLICY IF EXISTS "Authenticated insert procedures" ON public.procedures;
DROP POLICY IF EXISTS "Authenticated update procedures" ON public.procedures;
DROP POLICY IF EXISTS "Authenticated delete procedures" ON public.procedures;
CREATE POLICY procedures_insert_staff ON public.procedures FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[]));
CREATE POLICY procedures_update_staff ON public.procedures FOR UPDATE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[]))
  WITH CHECK (public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[]));
CREATE POLICY procedures_delete_admin ON public.procedures FOR DELETE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[]));

DROP POLICY IF EXISTS "Authenticated insert patients" ON public.patients;
DROP POLICY IF EXISTS "Authenticated update patients" ON public.patients;
DROP POLICY IF EXISTS "Authenticated delete patients" ON public.patients;
CREATE POLICY patients_insert_staff ON public.patients FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[]));
CREATE POLICY patients_update_staff ON public.patients FOR UPDATE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[]))
  WITH CHECK (public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[]));
CREATE POLICY patients_delete_admin ON public.patients FOR DELETE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[]));

-- ---------- Claims / finance ----------
DROP POLICY IF EXISTS "Authenticated insert claims" ON public.claims;
DROP POLICY IF EXISTS "Authenticated update claims" ON public.claims;
DROP POLICY IF EXISTS "Authenticated delete claims" ON public.claims;
CREATE POLICY claims_insert_staff ON public.claims FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[]));
CREATE POLICY claims_update_staff ON public.claims FOR UPDATE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','accounts_officer']::public.app_role[]))
  WITH CHECK (public.current_user_has_any_role(ARRAY['superuser','admin','claims_officer','accounts_officer']::public.app_role[]));
CREATE POLICY claims_delete_admin ON public.claims FOR DELETE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[]));

DROP POLICY IF EXISTS "Authenticated insert payments" ON public.payments;
DROP POLICY IF EXISTS "Authenticated update payments" ON public.payments;
DROP POLICY IF EXISTS "Authenticated delete payments" ON public.payments;
CREATE POLICY payments_insert_accounts ON public.payments FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_any_role(ARRAY['superuser','admin','accounts_officer']::public.app_role[]));
CREATE POLICY payments_update_accounts ON public.payments FOR UPDATE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['superuser','admin','accounts_officer']::public.app_role[]))
  WITH CHECK (public.current_user_has_any_role(ARRAY['superuser','admin','accounts_officer']::public.app_role[]));
CREATE POLICY payments_delete_admin ON public.payments FOR DELETE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[]));

DROP POLICY IF EXISTS "Authenticated insert withholding_tax" ON public.withholding_tax;
DROP POLICY IF EXISTS "Authenticated update withholding_tax" ON public.withholding_tax;
DROP POLICY IF EXISTS "Authenticated delete withholding_tax" ON public.withholding_tax;
CREATE POLICY withholding_tax_insert_accounts ON public.withholding_tax FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_any_role(ARRAY['superuser','admin','accounts_officer']::public.app_role[]));
CREATE POLICY withholding_tax_update_accounts ON public.withholding_tax FOR UPDATE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['superuser','admin','accounts_officer']::public.app_role[]))
  WITH CHECK (public.current_user_has_any_role(ARRAY['superuser','admin','accounts_officer']::public.app_role[]));
CREATE POLICY withholding_tax_delete_admin ON public.withholding_tax FOR DELETE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[]));

-- ---------- Notifications ----------
DROP POLICY IF EXISTS "System insert notifications" ON public.notifications;
CREATE POLICY notifications_insert_scoped ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    OR public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

COMMENT ON FUNCTION public.current_user_has_any_role(public.app_role[]) IS
  'RLS helper for least-privilege role checks; callers cannot supply a user id.';
