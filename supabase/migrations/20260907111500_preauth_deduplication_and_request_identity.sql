-- CareFlow Hub: durable pre-authorization identity + duplicate prevention.
-- This migration deliberately does NOT make the business payload globally unique:
-- legitimate repeat treatments may occur. Instead, the RPC detects materially
-- identical requests created within a controlled review window.

CREATE SEQUENCE IF NOT EXISTS public.preauth_request_number_seq START WITH 1 INCREMENT BY 1;

ALTER TABLE public.pre_authorizations
  ADD COLUMN IF NOT EXISTS request_number BIGINT,
  ADD COLUMN IF NOT EXISTS dedup_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS duplicate_checked_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS pre_authorizations_request_number_uidx
  ON public.pre_authorizations(request_number)
  WHERE request_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS pre_authorizations_dedup_fingerprint_idx
  ON public.pre_authorizations(dedup_fingerprint);

CREATE OR REPLACE FUNCTION public.assign_preauth_request_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.request_number IS NULL THEN
    NEW.request_number := nextval('public.preauth_request_number_seq');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_preauth_request_number ON public.pre_authorizations;
CREATE TRIGGER trg_assign_preauth_request_number
  BEFORE INSERT ON public.pre_authorizations
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_preauth_request_number();

-- Canonical fingerprint for an authorization request. JSONB normalizes object
-- key order, while preserving the user's cost-line order for audit fidelity.
CREATE OR REPLACE FUNCTION public.build_preauth_dedup_fingerprint(
  p_patient_id UUID,
  p_insurance_company_id UUID,
  p_doctor_id UUID,
  p_procedure_id UUID,
  p_procedure_date DATE,
  p_diagnosis TEXT,
  p_items JSONB
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT md5(
    jsonb_build_object(
      'patient_id', p_patient_id,
      'insurance_company_id', p_insurance_company_id,
      'doctor_id', p_doctor_id,
      'procedure_id', p_procedure_id,
      'procedure_date', p_procedure_date,
      'diagnosis', lower(regexp_replace(trim(coalesce(p_diagnosis, '')), '\\s+', ' ', 'g')),
      'items', coalesce(p_items, '[]'::jsonb)
    )::text
  );
$$;

-- Returns the matching request instead of silently creating another document.
-- Rejected requests are intentionally excluded so an officer can create a new
-- request after an insurer rejection. The 30-day window prevents stale history
-- from blocking legitimate future treatment.
CREATE OR REPLACE FUNCTION public.find_duplicate_preauthorization(
  p_patient_id UUID,
  p_insurance_company_id UUID,
  p_doctor_id UUID,
  p_procedure_id UUID,
  p_procedure_date DATE,
  p_diagnosis TEXT,
  p_items JSONB,
  p_exclude_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  request_number BIGINT,
  status TEXT,
  current_state TEXT,
  created_at TIMESTAMPTZ,
  total_cost NUMERIC,
  patient_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidate AS (
    SELECT public.build_preauth_dedup_fingerprint(
      p_patient_id,
      p_insurance_company_id,
      p_doctor_id,
      p_procedure_id,
      p_procedure_date,
      p_diagnosis,
      p_items
    ) AS fingerprint
  )
  SELECT pa.id, pa.request_number, pa.status, pa.current_state,
         pa.created_at, pa.total_cost, pa.patient_id
  FROM public.pre_authorizations pa, candidate c
  WHERE pa.dedup_fingerprint = c.fingerprint
    AND pa.id IS DISTINCT FROM p_exclude_id
    AND pa.created_at >= now() - interval '30 days'
    AND lower(coalesce(pa.status, '')) <> 'rejected'
  ORDER BY pa.created_at DESC
  LIMIT 1;
$$;

-- Backfill fingerprints for existing rows where cost lines can be recovered.
-- Rows without a safe reconstruction remain NULL and are never falsely blocked.
UPDATE public.pre_authorizations pa
SET request_number = nextval('public.preauth_request_number_seq')
WHERE pa.request_number IS NULL;

UPDATE public.pre_authorizations pa
SET dedup_fingerprint = public.build_preauth_dedup_fingerprint(
  pa.patient_id,
  pa.insurance_company_id,
  pa.doctor_id,
  pa.procedure_id,
  pa.procedure_date,
  pa.diagnosis,
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'description', i.description,
        'quantity', i.quantity,
        'unit_price', i.unit_price,
        'amount', i.amount
      ) ORDER BY i.id
    )
    FROM public.preauth_items i
    WHERE i.preauth_id = pa.id
  ), '[]'::jsonb)
)
WHERE pa.dedup_fingerprint IS NULL;

REVOKE ALL ON FUNCTION public.find_duplicate_preauthorization(UUID, UUID, UUID, UUID, DATE, TEXT, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_duplicate_preauthorization(UUID, UUID, UUID, UUID, DATE, TEXT, JSONB, UUID) TO authenticated;
