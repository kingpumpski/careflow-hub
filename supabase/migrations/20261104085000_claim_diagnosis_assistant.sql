CREATE TABLE IF NOT EXISTS public.claim_diagnosis_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  workflow_type text NOT NULL CHECK (workflow_type IN ('new_claim', 'rejected_claim')),
  patient_name text,
  claim_number text,
  date_of_service date,
  insurance_company_id uuid REFERENCES public.insurance_companies(id) ON DELETE SET NULL,
  rejection_reason text,
  clinical_notes text,
  co_payment numeric(12, 2) NOT NULL DEFAULT 0 CHECK (co_payment >= 0),
  authorization_code text,
  comments jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(comments) = 'array'),
  service_items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(service_items) = 'array'),
  diagnoses jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(diagnoses) = 'array'),
  response_message text,
  total_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status = 'draft'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claim_diagnosis_drafts_facility_created_idx
  ON public.claim_diagnosis_drafts (facility_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.validate_claim_diagnosis_draft()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.insurance_company_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.insurance_companies insurer
    WHERE insurer.id = NEW.insurance_company_id
      AND insurer.facility_id = NEW.facility_id
  ) THEN
    RAISE EXCEPTION 'Selected insurer does not belong to the draft facility'
      USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_claim_diagnosis_draft() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.claim_diagnosis_drafts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.claim_diagnosis_drafts TO authenticated;
REVOKE DELETE ON public.claim_diagnosis_drafts FROM authenticated;

CREATE POLICY claim_diagnosis_drafts_select
  ON public.claim_diagnosis_drafts
  FOR SELECT TO authenticated
  USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_permission('claims.read')
  );

CREATE POLICY claim_diagnosis_drafts_insert
  ON public.claim_diagnosis_drafts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.core_facility_access(facility_id)
    AND public.current_user_has_permission('claims.write')
    AND created_by = (SELECT auth.uid())
  );

CREATE POLICY claim_diagnosis_drafts_update
  ON public.claim_diagnosis_drafts
  FOR UPDATE TO authenticated
  USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_permission('claims.write')
    AND created_by = (SELECT auth.uid())
  )
  WITH CHECK (
    public.core_facility_access(facility_id)
    AND public.current_user_has_permission('claims.write')
    AND created_by = (SELECT auth.uid())
    AND status = 'draft'
  );

CREATE TRIGGER validate_claim_diagnosis_draft
  BEFORE INSERT OR UPDATE ON public.claim_diagnosis_drafts
  FOR EACH ROW EXECUTE FUNCTION public.validate_claim_diagnosis_draft();

CREATE TRIGGER audit_claim_diagnosis_drafts
  AFTER INSERT OR UPDATE ON public.claim_diagnosis_drafts
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

DROP POLICY IF EXISTS "Permission read preauth catalog items" ON public.preauth_catalog_items;
CREATE POLICY "Permission read preauth catalog items"
  ON public.preauth_catalog_items FOR SELECT TO authenticated
  USING (
    public.current_user_has_permission('preauth.read')
    OR public.current_user_has_permission('claims.read')
  );

DROP POLICY IF EXISTS "Permission read diagnosis codes" ON public.diagnosis_codes;
CREATE POLICY "Permission read diagnosis codes"
  ON public.diagnosis_codes FOR SELECT TO authenticated
  USING (
    public.current_user_has_permission('preauth.read')
    OR public.current_user_has_permission('claims.read')
  );

CREATE OR REPLACE FUNCTION public.log_claim_diagnosis_event(
  p_record_id text,
  p_action text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_audit_id uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.current_user_has_permission('claims.read') THEN
    RAISE EXCEPTION 'Insufficient permission to record claim analysis activity'
      USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('analysis_completed', 'recommendation_selected', 'recommendation_feedback', 'claim_update_prepared') THEN
    RAISE EXCEPTION 'Unsupported claim analysis audit action'
      USING ERRCODE = '22023';
  END IF;

  IF p_record_id IS NULL OR length(p_record_id) > 100
     OR p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object'
     OR octet_length(p_metadata::text) > 16000 THEN
    RAISE EXCEPTION 'Invalid claim analysis audit payload'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.audit_logs (table_name, record_id, action, new_data, changed_by)
  VALUES (
    'claim_diagnosis_assistant',
    p_record_id,
    p_action,
    jsonb_build_object('event', 'claim_diagnosis_assistant', 'metadata', p_metadata),
    v_actor
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_claim_diagnosis_event(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_claim_diagnosis_event(text, text, jsonb) TO authenticated;

COMMENT ON TABLE public.claim_diagnosis_drafts IS
  'Facility-scoped, review-only claim diagnosis drafts. Saving a draft never submits or changes a production claim.';
