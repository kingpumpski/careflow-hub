-- Pre-Authorization Studio is intentionally independent of a client master record.
-- A patient/client may have no stored profile, may hold multiple policies, or may
-- change insurers. The authorization document must therefore carry a point-in-time
-- identity snapshot supplied by the officer.

ALTER TABLE public.pre_authorizations
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS client_date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS client_phone TEXT,
  ADD COLUMN IF NOT EXISTS client_email TEXT,
  ADD COLUMN IF NOT EXISTS client_address TEXT,
  ADD COLUMN IF NOT EXISTS client_identifier TEXT,
  ADD COLUMN IF NOT EXISTS client_membership_number TEXT,
  ADD COLUMN IF NOT EXISTS insurer_name TEXT,
  ADD COLUMN IF NOT EXISTS insurer_member_number TEXT,
  ADD COLUMN IF NOT EXISTS insurer_plan_name TEXT,
  ADD COLUMN IF NOT EXISTS insurer_phone TEXT,
  ADD COLUMN IF NOT EXISTS insurer_email TEXT,
  ADD COLUMN IF NOT EXISTS insurer_policy_reference TEXT;

-- The stored patient/insurer foreign keys remain optional legacy/reference links.
-- They are never required to create a pre-authorization document.
ALTER TABLE public.pre_authorizations
  ALTER COLUMN patient_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS pre_authorizations_client_name_idx
  ON public.pre_authorizations (lower(client_name));

CREATE INDEX IF NOT EXISTS pre_authorizations_client_identifier_idx
  ON public.pre_authorizations (client_identifier)
  WHERE client_identifier IS NOT NULL AND btrim(client_identifier) <> '';

CREATE INDEX IF NOT EXISTS pre_authorizations_insurer_member_idx
  ON public.pre_authorizations (insurer_member_number)
  WHERE insurer_member_number IS NOT NULL AND btrim(insurer_member_number) <> '';

-- Correct the earlier duplicate lookup so it is safe to invoke from the browser.
-- SECURITY DEFINER is retained only for the lookup boundary; authorization is
-- explicitly checked and the public EXECUTE privilege is removed.
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
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
END;
$$;

REVOKE ALL ON FUNCTION public.find_duplicate_preauthorization(UUID, UUID, UUID, UUID, DATE, TEXT, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_duplicate_preauthorization(UUID, UUID, UUID, UUID, DATE, TEXT, JSONB, UUID) TO authenticated;
