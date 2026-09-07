-- Database boundary protection for clients that do not call the duplicate-check RPC.
-- The request identity is based on stable request-level fields available at INSERT.
-- Cost-line differences can still be reviewed through the RPC once the form sends
-- the complete item payload; this guard prevents the common accidental double-click
-- / repeated identical request case even from legacy clients.

CREATE OR REPLACE FUNCTION public.guard_duplicate_preauthorization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fingerprint TEXT;
  v_existing RECORD;
BEGIN
  v_fingerprint := public.build_preauth_dedup_fingerprint(
    NEW.patient_id,
    NEW.insurance_company_id,
    NEW.doctor_id,
    NEW.procedure_id,
    NEW.procedure_date,
    NEW.diagnosis,
    '[]'::jsonb
  );

  SELECT pa.id, pa.request_number, pa.status, pa.current_state
  INTO v_existing
  FROM public.pre_authorizations pa
  WHERE pa.dedup_fingerprint = v_fingerprint
    AND pa.id IS DISTINCT FROM NEW.id
    AND pa.created_at >= now() - interval '30 days'
    AND lower(coalesce(pa.status, '')) <> 'rejected'
  ORDER BY pa.created_at DESC
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICATE_PREAUTH: An equivalent pre-authorization already exists (request #%).',
      v_existing.request_number
      USING ERRCODE = 'unique_violation',
            HINT = 'Open the existing request instead of creating another copy.';
  END IF;

  NEW.dedup_fingerprint := v_fingerprint;
  NEW.duplicate_checked_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_duplicate_preauthorization ON public.pre_authorizations;
CREATE TRIGGER trg_guard_duplicate_preauthorization
  BEFORE INSERT ON public.pre_authorizations
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_duplicate_preauthorization();

-- Normalize historical fingerprints to the same request-level identity used by
-- the trigger. Existing records retain their request numbers and audit history.
UPDATE public.pre_authorizations pa
SET dedup_fingerprint = public.build_preauth_dedup_fingerprint(
  pa.patient_id,
  pa.insurance_company_id,
  pa.doctor_id,
  pa.procedure_id,
  pa.procedure_date,
  pa.diagnosis,
  '[]'::jsonb
)
WHERE pa.dedup_fingerprint IS NOT NULL;
