-- Pre-Authorization lifecycle boundary hardening.
-- The authoritative workflow is document preparation + officer email-client handoff.
-- Legacy insurer-submission execution and automatic version-capture paths are retired.

ALTER TABLE public.preauthorization_versions
  ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id) ON DELETE RESTRICT;

UPDATE public.preauthorization_versions v
SET facility_id = p.facility_id
FROM public.pre_authorizations p
WHERE v.preauth_id = p.id
  AND v.facility_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_preauthorization_versions_facility
  ON public.preauthorization_versions(facility_id, preauth_id, version_number DESC);

ALTER TABLE public.preauthorization_submissions
  DROP CONSTRAINT IF EXISTS preauthorization_submissions_status_check;
ALTER TABLE public.preauthorization_submissions
  ADD CONSTRAINT preauthorization_submissions_status_check
  CHECK (status = 'prepared');

-- A draft/save must not silently create an immutable final revision. Revision
-- creation is reserved for the explicit Freeze & Prepare operation below.
DROP TRIGGER IF EXISTS trg_capture_preauth_version ON public.pre_authorizations;
DROP TRIGGER IF EXISTS trg_capture_preauth_version_deferred ON public.pre_authorizations;

-- Remove historical execution RPCs if they still exist. They must not be exposed
-- as a second submission path beside the document-first handoff workflow.
DROP FUNCTION IF EXISTS public.submit_preauthorization(UUID,TEXT,TEXT,TEXT);
DROP FUNCTION IF EXISTS public.process_preauth_submission(UUID);
DROP FUNCTION IF EXISTS public.complete_preauth_submission(UUID,TEXT,TEXT);
DROP FUNCTION IF EXISTS public.fail_preauth_submission(UUID,TEXT,TEXT);
DROP FUNCTION IF EXISTS public.create_preauth_version(UUID,TEXT);
DROP FUNCTION IF EXISTS public.preauth_snapshot(UUID);

DO $$
BEGIN
  IF to_regclass('public.preauth_submissions') IS NOT NULL THEN
    REVOKE ALL ON public.preauth_submissions FROM anon;
    REVOKE INSERT, UPDATE, DELETE ON public.preauth_submissions FROM authenticated;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.finalize_preauthorization_handoff(
  p_preauth_id uuid,
  p_snapshot jsonb,
  p_total_cost numeric,
  p_recipient_manifest jsonb,
  p_attachment_manifest jsonb,
  p_subject text,
  p_message_body text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_p public.pre_authorizations;
  v_facility uuid;
  v_version_number integer;
  v_version_id uuid;
  v_submission_id uuid;
  v_actor uuid;
  v_key text;
  v_subject text;
  v_body text;
BEGIN
  v_actor := (select auth.uid());
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_preauth_id IS NULL OR p_snapshot IS NULL OR jsonb_typeof(p_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_HANDOFF_PAYLOAD' USING ERRCODE = '22023';
  END IF;
  IF p_total_cost IS NULL OR p_total_cost < 0 THEN
    RAISE EXCEPTION 'INVALID_TOTAL_COST' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(coalesce(p_recipient_manifest, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(coalesce(p_attachment_manifest, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_MANIFEST' USING ERRCODE = '22023';
  END IF;

  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  IF v_key IS NULL OR length(v_key) > 200 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY' USING ERRCODE = '22023';
  END IF;
  v_subject := nullif(btrim(coalesce(p_subject, '')), '');
  v_body := coalesce(p_message_body, '');
  IF v_subject IS NULL OR length(v_subject) > 500 OR length(v_body) > 50000 THEN
    RAISE EXCEPTION 'INVALID_EMAIL_CONTENT' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_p
  FROM public.pre_authorizations
  WHERE id = p_preauth_id
  FOR UPDATE;

  IF v_p.id IS NULL THEN
    RAISE EXCEPTION 'PREAUTH_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_facility := v_p.facility_id;
  IF v_facility IS NULL OR NOT public.user_has_facility_access(v_facility) THEN
    RAISE EXCEPTION 'FACILITY_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('preauth-handoff:' || p_preauth_id::text, 0));

  SELECT s.id, s.version_id
    INTO v_submission_id, v_version_id
  FROM public.preauthorization_submissions s
  WHERE s.preauth_id = p_preauth_id
    AND s.idempotency_key = v_key
  LIMIT 1;

  IF v_submission_id IS NOT NULL THEN
    SELECT v.version_number INTO v_version_number
    FROM public.preauthorization_versions v
    WHERE v.id = v_version_id;

    RETURN jsonb_build_object(
      'version_id', v_version_id,
      'version_number', v_version_number,
      'submission_id', v_submission_id,
      'idempotent', true
    );
  END IF;

  SELECT coalesce(max(version_number), 0) + 1
    INTO v_version_number
  FROM public.preauthorization_versions
  WHERE preauth_id = p_preauth_id;

  INSERT INTO public.preauthorization_versions (
    preauth_id, version_number, snapshot, total_cost, created_by, facility_id
  )
  VALUES (
    p_preauth_id, v_version_number, p_snapshot, round(p_total_cost, 2), v_actor, v_facility
  )
  RETURNING id INTO v_version_id;

  INSERT INTO public.preauthorization_submissions (
    preauth_id, version_id, idempotency_key, submission_channel, status,
    recipient_manifest, attachment_manifest, subject, message_body,
    submitted_by, prepared_at, facility_id
  )
  VALUES (
    p_preauth_id, v_version_id, v_key, 'email', 'prepared',
    p_recipient_manifest, p_attachment_manifest, v_subject, v_body,
    v_actor, now(), v_facility
  )
  RETURNING id INTO v_submission_id;

  UPDATE public.pre_authorizations
  SET document_revision = v_version_number,
      document_payload = p_snapshot,
      document_finalized_at = now(),
      status = 'submitted',
      current_state = 'Email handoff prepared'
  WHERE id = p_preauth_id;

  RETURN jsonb_build_object(
    'version_id', v_version_id,
    'version_number', v_version_number,
    'submission_id', v_submission_id,
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_preauthorization_handoff(UUID,JSONB,NUMERIC,JSONB,JSONB,TEXT,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_preauthorization_handoff(UUID,JSONB,NUMERIC,JSONB,JSONB,TEXT,TEXT,TEXT) TO authenticated;

COMMENT ON FUNCTION public.finalize_preauthorization_handoff(UUID,JSONB,NUMERIC,JSONB,JSONB,TEXT,TEXT,TEXT) IS
  'Atomically freezes a facility-scoped pre-authorization revision and records a prepared email-client handoff. It does not send or deliver email.';
