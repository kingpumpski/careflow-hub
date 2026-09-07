-- The original duplicate trigger used only foreign-key IDs. That is unsafe for
-- the text-first studio because two unrelated clients with no stored IDs could
-- look identical. The guard now includes the point-in-time client and payer
-- identity plus the request total.

CREATE OR REPLACE FUNCTION public.build_preauth_text_identity_fingerprint(
  p_patient_id UUID,
  p_client_name TEXT,
  p_client_date_of_birth DATE,
  p_client_identifier TEXT,
  p_client_membership_number TEXT,
  p_insurance_company_id UUID,
  p_insurer_name TEXT,
  p_insurer_member_number TEXT,
  p_insurer_plan_name TEXT,
  p_insurer_policy_reference TEXT,
  p_doctor_id UUID,
  p_procedure_id UUID,
  p_procedure_date DATE,
  p_diagnosis TEXT,
  p_total_cost NUMERIC
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT md5(jsonb_build_object(
    'patient_id', p_patient_id,
    'client_name', lower(regexp_replace(trim(coalesce(p_client_name, '')), '\\s+', ' ', 'g')),
    'client_date_of_birth', p_client_date_of_birth,
    'client_identifier', lower(trim(coalesce(p_client_identifier, ''))),
    'client_membership_number', lower(trim(coalesce(p_client_membership_number, ''))),
    'insurance_company_id', p_insurance_company_id,
    'insurer_name', lower(regexp_replace(trim(coalesce(p_insurer_name, '')), '\\s+', ' ', 'g')),
    'insurer_member_number', lower(trim(coalesce(p_insurer_member_number, ''))),
    'insurer_plan_name', lower(regexp_replace(trim(coalesce(p_insurer_plan_name, '')), '\\s+', ' ', 'g')),
    'insurer_policy_reference', lower(trim(coalesce(p_insurer_policy_reference, ''))),
    'doctor_id', p_doctor_id,
    'procedure_id', p_procedure_id,
    'procedure_date', p_procedure_date,
    'diagnosis', lower(regexp_replace(trim(coalesce(p_diagnosis, '')), '\\s+', ' ', 'g')),
    'total_cost', round(coalesce(p_total_cost, 0), 2)
  )::text);
$$;

CREATE OR REPLACE FUNCTION public.guard_duplicate_preauthorization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  fingerprint TEXT;
  existing_request BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  fingerprint := public.build_preauth_text_identity_fingerprint(
    NEW.patient_id, NEW.client_name, NEW.client_date_of_birth,
    NEW.client_identifier, NEW.client_membership_number,
    NEW.insurance_company_id, NEW.insurer_name, NEW.insurer_member_number,
    NEW.insurer_plan_name, NEW.insurer_policy_reference,
    NEW.doctor_id, NEW.procedure_id, NEW.procedure_date,
    NEW.diagnosis, NEW.total_cost
  );

  SELECT pa.request_number INTO existing_request
  FROM public.pre_authorizations pa
  WHERE pa.dedup_fingerprint = fingerprint
    AND pa.created_at >= now() - interval '30 days'
    AND lower(coalesce(pa.status, '')) <> 'rejected'
  ORDER BY pa.created_at DESC
  LIMIT 1;

  IF existing_request IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICATE_PREAUTH: An equivalent pre-authorization already exists (request #%).', existing_request
      USING ERRCODE = '23505', HINT = 'Open the existing request or materially change the request details before creating another one.';
  END IF;

  NEW.dedup_fingerprint := fingerprint;
  NEW.duplicate_checked_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_duplicate_preauthorization ON public.pre_authorizations;
CREATE TRIGGER trg_guard_duplicate_preauthorization
  BEFORE INSERT ON public.pre_authorizations
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_duplicate_preauthorization();

REVOKE ALL ON FUNCTION public.build_preauth_text_identity_fingerprint(UUID,TEXT,DATE,TEXT,TEXT,UUID,TEXT,TEXT,TEXT,TEXT,UUID,UUID,DATE,TEXT,NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_duplicate_preauthorization() FROM PUBLIC, anon, authenticated;
