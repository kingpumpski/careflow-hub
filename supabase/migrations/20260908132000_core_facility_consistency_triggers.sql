-- Prevent tenant hopping through foreign-key relationships.
-- The facility column and every facility-bearing reference must resolve to the same tenant.

CREATE OR REPLACE FUNCTION public.enforce_core_facility_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_parent_facility uuid;
  v_ref_facility uuid;
BEGIN
  IF TG_TABLE_NAME = 'preauth_items' THEN
    SELECT p.facility_id INTO v_parent_facility FROM public.pre_authorizations p WHERE p.id = NEW.preauth_id;
    IF v_parent_facility IS NULL OR NEW.facility_id IS DISTINCT FROM v_parent_facility THEN
      RAISE EXCEPTION 'PREAUTH_ITEM_FACILITY_MISMATCH' USING ERRCODE='23514';
    END IF;

  ELSIF TG_TABLE_NAME = 'claims' THEN
    IF NEW.preauth_id IS NOT NULL THEN
      SELECT p.facility_id INTO v_parent_facility FROM public.pre_authorizations p WHERE p.id = NEW.preauth_id;
      IF v_parent_facility IS NULL OR NEW.facility_id IS DISTINCT FROM v_parent_facility THEN
        RAISE EXCEPTION 'CLAIM_PREAUTH_FACILITY_MISMATCH' USING ERRCODE='23514';
      END IF;
    END IF;
    SELECT i.facility_id INTO v_ref_facility FROM public.insurance_companies i WHERE i.id = NEW.insurance_company_id;
    IF v_ref_facility IS NOT NULL AND v_ref_facility IS DISTINCT FROM NEW.facility_id THEN
      RAISE EXCEPTION 'CLAIM_INSURER_FACILITY_MISMATCH' USING ERRCODE='23514';
    END IF;

  ELSIF TG_TABLE_NAME = 'payments' THEN
    IF NEW.claim_id IS NOT NULL THEN
      SELECT c.facility_id INTO v_parent_facility FROM public.claims c WHERE c.id = NEW.claim_id;
      IF v_parent_facility IS NULL OR NEW.facility_id IS DISTINCT FROM v_parent_facility THEN
        RAISE EXCEPTION 'PAYMENT_CLAIM_FACILITY_MISMATCH' USING ERRCODE='23514';
      END IF;
    END IF;
    IF NEW.insurance_company_id IS NOT NULL THEN
      SELECT i.facility_id INTO v_ref_facility FROM public.insurance_companies i WHERE i.id = NEW.insurance_company_id;
      IF v_ref_facility IS NOT NULL AND v_ref_facility IS DISTINCT FROM NEW.facility_id THEN
        RAISE EXCEPTION 'PAYMENT_INSURER_FACILITY_MISMATCH' USING ERRCODE='23514';
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'withholding_tax' THEN
    SELECT i.facility_id INTO v_ref_facility FROM public.insurance_companies i WHERE i.id = NEW.insurance_company_id;
    IF v_ref_facility IS NULL OR NEW.facility_id IS DISTINCT FROM v_ref_facility THEN
      RAISE EXCEPTION 'TAX_INSURER_FACILITY_MISMATCH' USING ERRCODE='23514';
    END IF;

  ELSIF TG_TABLE_NAME = 'client_companies' THEN
    IF NEW.insurance_company_id IS NOT NULL THEN
      SELECT i.facility_id INTO v_ref_facility FROM public.insurance_companies i WHERE i.id = NEW.insurance_company_id;
      IF v_ref_facility IS NULL OR NEW.facility_id IS DISTINCT FROM v_ref_facility THEN
        RAISE EXCEPTION 'CLIENT_COMPANY_INSURER_FACILITY_MISMATCH' USING ERRCODE='23514';
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'patients' THEN
    IF NEW.insurance_company_id IS NOT NULL THEN
      SELECT i.facility_id INTO v_ref_facility FROM public.insurance_companies i WHERE i.id = NEW.insurance_company_id;
      IF v_ref_facility IS NULL OR NEW.facility_id IS DISTINCT FROM v_ref_facility THEN
        RAISE EXCEPTION 'PATIENT_INSURER_FACILITY_MISMATCH' USING ERRCODE='23514';
      END IF;
    END IF;
    IF NEW.client_company_id IS NOT NULL THEN
      SELECT c.facility_id INTO v_ref_facility FROM public.client_companies c WHERE c.id = NEW.client_company_id;
      IF v_ref_facility IS NULL OR NEW.facility_id IS DISTINCT FROM v_ref_facility THEN
        RAISE EXCEPTION 'PATIENT_CLIENT_COMPANY_FACILITY_MISMATCH' USING ERRCODE='23514';
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'pre_authorizations' THEN
    IF NEW.patient_id IS NOT NULL THEN
      SELECT p.facility_id INTO v_ref_facility FROM public.patients p WHERE p.id = NEW.patient_id;
      IF v_ref_facility IS NULL OR NEW.facility_id IS DISTINCT FROM v_ref_facility THEN
        RAISE EXCEPTION 'PREAUTH_PATIENT_FACILITY_MISMATCH' USING ERRCODE='23514';
      END IF;
    END IF;
    IF NEW.insurance_company_id IS NOT NULL THEN
      SELECT i.facility_id INTO v_ref_facility FROM public.insurance_companies i WHERE i.id = NEW.insurance_company_id;
      IF v_ref_facility IS NULL OR NEW.facility_id IS DISTINCT FROM v_ref_facility THEN
        RAISE EXCEPTION 'PREAUTH_INSURER_FACILITY_MISMATCH' USING ERRCODE='23514';
      END IF;
    END IF;
    IF NEW.doctor_id IS NOT NULL THEN
      SELECT d.facility_id INTO v_ref_facility FROM public.doctors d WHERE d.id = NEW.doctor_id;
      IF v_ref_facility IS NULL OR NEW.facility_id IS DISTINCT FROM v_ref_facility THEN
        RAISE EXCEPTION 'PREAUTH_DOCTOR_FACILITY_MISMATCH' USING ERRCODE='23514';
      END IF;
    END IF;
    IF NEW.procedure_id IS NOT NULL THEN
      SELECT p.facility_id INTO v_ref_facility FROM public.procedures p WHERE p.id = NEW.procedure_id;
      IF v_ref_facility IS NULL OR NEW.facility_id IS DISTINCT FROM v_ref_facility THEN
        RAISE EXCEPTION 'PREAUTH_PROCEDURE_FACILITY_MISMATCH' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_core_facility_consistency() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_core_facility_consistency ON public.pre_authorizations;
CREATE TRIGGER trg_core_facility_consistency BEFORE INSERT OR UPDATE ON public.pre_authorizations FOR EACH ROW EXECUTE FUNCTION public.enforce_core_facility_consistency();
DROP TRIGGER IF EXISTS trg_core_facility_consistency ON public.preauth_items;
CREATE TRIGGER trg_core_facility_consistency BEFORE INSERT OR UPDATE ON public.preauth_items FOR EACH ROW EXECUTE FUNCTION public.enforce_core_facility_consistency();
DROP TRIGGER IF EXISTS trg_core_facility_consistency ON public.claims;
CREATE TRIGGER trg_core_facility_consistency BEFORE INSERT OR UPDATE ON public.claims FOR EACH ROW EXECUTE FUNCTION public.enforce_core_facility_consistency();
DROP TRIGGER IF EXISTS trg_core_facility_consistency ON public.payments;
CREATE TRIGGER trg_core_facility_consistency BEFORE INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.enforce_core_facility_consistency();
DROP TRIGGER IF EXISTS trg_core_facility_consistency ON public.withholding_tax;
CREATE TRIGGER trg_core_facility_consistency BEFORE INSERT OR UPDATE ON public.withholding_tax FOR EACH ROW EXECUTE FUNCTION public.enforce_core_facility_consistency();
DROP TRIGGER IF EXISTS trg_core_facility_consistency ON public.client_companies;
CREATE TRIGGER trg_core_facility_consistency BEFORE INSERT OR UPDATE ON public.client_companies FOR EACH ROW EXECUTE FUNCTION public.enforce_core_facility_consistency();
DROP TRIGGER IF EXISTS trg_core_facility_consistency ON public.patients;
CREATE TRIGGER trg_core_facility_consistency BEFORE INSERT OR UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.enforce_core_facility_consistency();

-- Master-data rows are required to carry a tenant when created/changed.
CREATE OR REPLACE FUNCTION public.require_core_master_facility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.facility_id IS NULL THEN RAISE EXCEPTION 'FACILITY_REQUIRED' USING ERRCODE='23514'; END IF;
  IF NOT public.user_has_facility_access(NEW.facility_id) AND (select auth.uid()) IS NOT NULL THEN
    RAISE EXCEPTION 'FACILITY_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.require_core_master_facility() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_require_facility_insurance_companies ON public.insurance_companies;
CREATE TRIGGER trg_require_facility_insurance_companies BEFORE INSERT OR UPDATE ON public.insurance_companies FOR EACH ROW EXECUTE FUNCTION public.require_core_master_facility();
DROP TRIGGER IF EXISTS trg_require_facility_client_companies ON public.client_companies;
CREATE TRIGGER trg_require_facility_client_companies BEFORE INSERT OR UPDATE ON public.client_companies FOR EACH ROW EXECUTE FUNCTION public.require_core_master_facility();
DROP TRIGGER IF EXISTS trg_require_facility_doctors ON public.doctors;
CREATE TRIGGER trg_require_facility_doctors BEFORE INSERT OR UPDATE ON public.doctors FOR EACH ROW EXECUTE FUNCTION public.require_core_master_facility();
DROP TRIGGER IF EXISTS trg_require_facility_procedures ON public.procedures;
CREATE TRIGGER trg_require_facility_procedures BEFORE INSERT OR UPDATE ON public.procedures FOR EACH ROW EXECUTE FUNCTION public.require_core_master_facility();
DROP TRIGGER IF EXISTS trg_require_facility_patients ON public.patients;
CREATE TRIGGER trg_require_facility_patients BEFORE INSERT OR UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.require_core_master_facility();
