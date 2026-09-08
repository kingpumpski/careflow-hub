-- Core multi-tenant boundary hardening.
-- Existing legacy rows remain unassigned until an explicit data-owner backfill is performed.
-- Unassigned operational rows are intentionally denied to ordinary authenticated users.

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id) ON DELETE RESTRICT;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id) ON DELETE RESTRICT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id) ON DELETE RESTRICT;
ALTER TABLE public.withholding_tax ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id) ON DELETE RESTRICT;
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id) ON DELETE RESTRICT;
ALTER TABLE public.client_companies ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id) ON DELETE RESTRICT;
ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id) ON DELETE RESTRICT;
ALTER TABLE public.procedures ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id) ON DELETE RESTRICT;
ALTER TABLE public.preauth_items ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id) ON DELETE RESTRICT;

-- Safe inheritance for records whose tenant can be established from an authoritative parent.
UPDATE public.claims c
SET facility_id = p.facility_id
FROM public.pre_authorizations p
WHERE c.facility_id IS NULL
  AND c.preauth_id = p.id
  AND p.facility_id IS NOT NULL;

UPDATE public.payments pay
SET facility_id = c.facility_id
FROM public.claims c
WHERE pay.facility_id IS NULL
  AND pay.claim_id = c.id
  AND c.facility_id IS NOT NULL;

UPDATE public.preauth_items i
SET facility_id = p.facility_id
FROM public.pre_authorizations p
WHERE i.facility_id IS NULL
  AND i.preauth_id = p.id
  AND p.facility_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS patients_facility_idx ON public.patients(facility_id, created_at DESC);
CREATE INDEX IF NOT EXISTS claims_facility_time_idx ON public.claims(facility_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_facility_time_idx ON public.payments(facility_id, created_at DESC);
CREATE INDEX IF NOT EXISTS withholding_tax_facility_time_idx ON public.withholding_tax(facility_id, created_at DESC);
CREATE INDEX IF NOT EXISTS insurance_companies_facility_idx ON public.insurance_companies(facility_id, company_name);
CREATE INDEX IF NOT EXISTS client_companies_facility_idx ON public.client_companies(facility_id, company_name);
CREATE INDEX IF NOT EXISTS doctors_facility_idx ON public.doctors(facility_id, doctor_name);
CREATE INDEX IF NOT EXISTS procedures_facility_idx ON public.procedures(facility_id, procedure_name);
CREATE INDEX IF NOT EXISTS preauth_items_facility_idx ON public.preauth_items(facility_id, preauth_id);

CREATE OR REPLACE FUNCTION public.core_facility_access(p_facility_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_facility_id IS NOT NULL AND public.user_has_facility_access(p_facility_id);
$$;
REVOKE ALL ON FUNCTION public.core_facility_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.core_facility_access(uuid) TO authenticated;

-- Replace legacy global CRUD policies. All new operational writes must name an
-- authorized facility; NULL legacy rows are not exposed to ordinary users.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname='public' AND tablename IN (
    'insurance_companies','client_companies','doctors','procedures','patients','pre_authorizations','preauth_items','claims','payments','withholding_tax'
  ) AND policyname LIKE 'Authenticated %' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Insurance companies
CREATE POLICY insurance_companies_facility_select ON public.insurance_companies FOR SELECT TO authenticated USING (public.core_facility_access(facility_id));
CREATE POLICY insurance_companies_facility_insert ON public.insurance_companies FOR INSERT TO authenticated WITH CHECK (public.core_facility_access(facility_id));
CREATE POLICY insurance_companies_facility_update ON public.insurance_companies FOR UPDATE TO authenticated USING (public.core_facility_access(facility_id)) WITH CHECK (public.core_facility_access(facility_id));
CREATE POLICY insurance_companies_facility_delete ON public.insurance_companies FOR DELETE TO authenticated USING (public.core_facility_access(facility_id));

-- Client companies
CREATE POLICY client_companies_facility_select ON public.client_companies FOR SELECT TO authenticated USING (public.core_facility_access(facility_id));
CREATE POLICY client_companies_facility_insert ON public.client_companies FOR INSERT TO authenticated WITH CHECK (public.core_facility_access(facility_id));
CREATE POLICY client_companies_facility_update ON public.client_companies FOR UPDATE TO authenticated USING (public.core_facility_access(facility_id)) WITH CHECK (public.core_facility_access(facility_id));
CREATE POLICY client_companies_facility_delete ON public.client_companies FOR DELETE TO authenticated USING (public.core_facility_access(facility_id));

-- Doctors
CREATE POLICY doctors_facility_select ON public.doctors FOR SELECT TO authenticated USING (public.core_facility_access(facility_id));
CREATE POLICY doctors_facility_insert ON public.doctors FOR INSERT TO authenticated WITH CHECK (public.core_facility_access(facility_id));
CREATE POLICY doctors_facility_update ON public.doctors FOR UPDATE TO authenticated USING (public.core_facility_access(facility_id)) WITH CHECK (public.core_facility_access(facility_id));
CREATE POLICY doctors_facility_delete ON public.doctors FOR DELETE TO authenticated USING (public.core_facility_access(facility_id));

-- Procedures
CREATE POLICY procedures_facility_select ON public.procedures FOR SELECT TO authenticated USING (public.core_facility_access(facility_id));
CREATE POLICY procedures_facility_insert ON public.procedures FOR INSERT TO authenticated WITH CHECK (public.core_facility_access(facility_id));
CREATE POLICY procedures_facility_update ON public.procedures FOR UPDATE TO authenticated USING (public.core_facility_access(facility_id)) WITH CHECK (public.core_facility_access(facility_id));
CREATE POLICY procedures_facility_delete ON public.procedures FOR DELETE TO authenticated USING (public.core_facility_access(facility_id));

-- Patients
CREATE POLICY patients_facility_select ON public.patients FOR SELECT TO authenticated USING (public.core_facility_access(facility_id));
CREATE POLICY patients_facility_insert ON public.patients FOR INSERT TO authenticated WITH CHECK (public.core_facility_access(facility_id));
CREATE POLICY patients_facility_update ON public.patients FOR UPDATE TO authenticated USING (public.core_facility_access(facility_id)) WITH CHECK (public.core_facility_access(facility_id));
CREATE POLICY patients_facility_delete ON public.patients FOR DELETE TO authenticated USING (public.core_facility_access(facility_id));

-- Pre-auth items: tenant is inherited from the parent request by the next trigger.
CREATE POLICY preauth_items_facility_select ON public.preauth_items FOR SELECT TO authenticated USING (public.core_facility_access(facility_id));
CREATE POLICY preauth_items_facility_insert ON public.preauth_items FOR INSERT TO authenticated WITH CHECK (public.core_facility_access(facility_id));
CREATE POLICY preauth_items_facility_update ON public.preauth_items FOR UPDATE TO authenticated USING (public.core_facility_access(facility_id)) WITH CHECK (public.core_facility_access(facility_id));
CREATE POLICY preauth_items_facility_delete ON public.preauth_items FOR DELETE TO authenticated USING (public.core_facility_access(facility_id));

-- Claims
CREATE POLICY claims_facility_select ON public.claims FOR SELECT TO authenticated USING (public.core_facility_access(facility_id));
CREATE POLICY claims_facility_insert ON public.claims FOR INSERT TO authenticated WITH CHECK (public.core_facility_access(facility_id));
CREATE POLICY claims_facility_update ON public.claims FOR UPDATE TO authenticated USING (public.core_facility_access(facility_id)) WITH CHECK (public.core_facility_access(facility_id));
CREATE POLICY claims_facility_delete ON public.claims FOR DELETE TO authenticated USING (public.core_facility_access(facility_id));

-- Payments
CREATE POLICY payments_facility_select ON public.payments FOR SELECT TO authenticated USING (public.core_facility_access(facility_id));
CREATE POLICY payments_facility_insert ON public.payments FOR INSERT TO authenticated WITH CHECK (public.core_facility_access(facility_id));
CREATE POLICY payments_facility_update ON public.payments FOR UPDATE TO authenticated USING (public.core_facility_access(facility_id)) WITH CHECK (public.core_facility_access(facility_id));
CREATE POLICY payments_facility_delete ON public.payments FOR DELETE TO authenticated USING (public.core_facility_access(facility_id));

-- Withholding tax
CREATE POLICY withholding_tax_facility_select ON public.withholding_tax FOR SELECT TO authenticated USING (public.core_facility_access(facility_id));
CREATE POLICY withholding_tax_facility_insert ON public.withholding_tax FOR INSERT TO authenticated WITH CHECK (public.core_facility_access(facility_id));
CREATE POLICY withholding_tax_facility_update ON public.withholding_tax FOR UPDATE TO authenticated USING (public.core_facility_access(facility_id)) WITH CHECK (public.core_facility_access(facility_id));
CREATE POLICY withholding_tax_facility_delete ON public.withholding_tax FOR DELETE TO authenticated USING (public.core_facility_access(facility_id));

REVOKE ALL ON TABLE public.insurance_companies, public.client_companies, public.doctors, public.procedures, public.patients, public.preauth_items, public.claims, public.payments, public.withholding_tax FROM anon;

COMMENT ON COLUMN public.claims.facility_id IS 'Owning facility/tenant; inherited from pre-authorization when available.';
COMMENT ON COLUMN public.payments.facility_id IS 'Owning facility/tenant; inherited from claim when available.';
COMMENT ON COLUMN public.preauth_items.facility_id IS 'Owning facility/tenant; must match parent pre-authorization.';
