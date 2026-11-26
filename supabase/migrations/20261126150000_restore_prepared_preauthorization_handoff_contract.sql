-- Forward-only repair of the Pre-Authorization document-preparation boundary.
-- The legacy preauth_submissions table is an insurer execution queue and is not
-- used by this function. This records a prepared email package for officer review;
-- it does not send email or submit to an insurer.

CREATE TABLE IF NOT EXISTS public.preauthorization_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preauth_id uuid NOT NULL REFERENCES public.pre_authorizations(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.preauthorization_versions(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  submission_channel text NOT NULL DEFAULT 'email',
  status text NOT NULL DEFAULT 'prepared',
  recipient_manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
  attachment_manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text,
  message_body text,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  facility_id uuid REFERENCES public.facilities(id) ON DELETE RESTRICT,
  CONSTRAINT preauthorization_submissions_idempotency_unique UNIQUE (preauth_id, idempotency_key)
);

ALTER TABLE public.preauthorization_submissions
  ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id) ON DELETE RESTRICT;

UPDATE public.preauthorization_submissions
SET status = 'prepared'
WHERE status IS DISTINCT FROM 'prepared';

ALTER TABLE public.preauthorization_submissions
  DROP CONSTRAINT IF EXISTS preauthorization_submissions_status_check;
ALTER TABLE public.preauthorization_submissions
  ADD CONSTRAINT preauthorization_submissions_status_check CHECK (status = 'prepared');

CREATE INDEX IF NOT EXISTS idx_preauthorization_submissions_facility
  ON public.preauthorization_submissions(facility_id, prepared_at DESC);

ALTER TABLE public.preauthorization_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.preauthorization_submissions FROM anon;
REVOKE UPDATE, DELETE ON public.preauthorization_submissions FROM authenticated;
GRANT SELECT, INSERT ON public.preauthorization_submissions TO authenticated;
GRANT ALL ON public.preauthorization_submissions TO service_role;

DROP POLICY IF EXISTS preauthorization_submissions_select_facility ON public.preauthorization_submissions;
CREATE POLICY preauthorization_submissions_select_facility ON public.preauthorization_submissions
  FOR SELECT TO authenticated
  USING (
    (facility_id IS NOT NULL AND public.user_has_facility_access(facility_id))
    OR (facility_id IS NULL AND submitted_by = (select auth.uid()))
  );

DROP POLICY IF EXISTS preauthorization_submissions_insert_facility ON public.preauthorization_submissions;
CREATE POLICY preauthorization_submissions_insert_facility ON public.preauthorization_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    facility_id IS NOT NULL
    AND public.user_has_facility_access(facility_id)
    AND submitted_by = (select auth.uid())
    AND status = 'prepared'
  );

DROP TRIGGER IF EXISTS trg_secure_preauthorization_submission_insert ON public.preauthorization_submissions;
CREATE TRIGGER trg_secure_preauthorization_submission_insert
  BEFORE INSERT ON public.preauthorization_submissions
  FOR EACH ROW EXECUTE FUNCTION public.secure_preauthorization_lifecycle_insert();

CREATE OR REPLACE FUNCTION security_internal.finalize_preauthorization_handoff(
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
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.pre_authorizations%rowtype;
  v_existing public.preauthorization_submissions%rowtype;
  v_version public.preauthorization_versions%rowtype;
  v_document public.preauth_document_registry%rowtype;
  v_handoff public.preauth_handoff_log%rowtype;
  v_submission public.preauthorization_submissions%rowtype;
  v_version_number integer;
  v_hash text;
  v_document_name text;
  v_attachment_name text;
  v_manifest jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode='42501'; END IF;
  IF NOT security_internal.current_user_has_permission('preauth.write') THEN
    RAISE EXCEPTION 'PREAUTH_WRITE_REQUIRED' USING errcode='42501';
  END IF;
  IF p_preauth_id IS NULL OR jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'INVALID_PREAUTH_SNAPSHOT' USING errcode='22023';
  END IF;
  IF length(trim(coalesce(p_idempotency_key,''))) < 8 OR length(p_idempotency_key) > 200 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY' USING errcode='22023';
  END IF;
  IF jsonb_typeof(p_recipient_manifest) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_recipient_manifest)=0 THEN
    RAISE EXCEPTION 'HANDOFF_RECIPIENTS_REQUIRED' USING errcode='22023';
  END IF;
  IF jsonb_typeof(coalesce(p_attachment_manifest,'[]'::jsonb)) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'INVALID_ATTACHMENT_MANIFEST' USING errcode='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_recipient_manifest) AS recipient
    WHERE recipient->>'type'='to'
      AND length(trim(coalesce(recipient->>'email',''))) > 3
  ) THEN
    RAISE EXCEPTION 'HANDOFF_PRIMARY_RECIPIENT_REQUIRED' USING errcode='22023';
  END IF;

  SELECT * INTO v_row
  FROM public.pre_authorizations
  WHERE id=p_preauth_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PREAUTH_NOT_FOUND' USING errcode='P0002'; END IF;
  IF v_row.facility_id IS NULL THEN RAISE EXCEPTION 'FACILITY_REQUIRED' USING errcode='23514'; END IF;
  IF NOT security_internal.user_has_facility_access(v_row.facility_id) THEN
    RAISE EXCEPTION 'FACILITY_ACCESS_DENIED' USING errcode='42501';
  END IF;
  IF p_total_cost IS NULL OR round(p_total_cost,2) <> round(coalesce(v_row.total_cost,0),2) THEN
    RAISE EXCEPTION 'TOTAL_COST_MISMATCH' USING errcode='22023';
  END IF;

  v_hash := encode(extensions.digest(convert_to(p_snapshot::text,'UTF8'),'sha256'),'hex');

  -- Serialize same-request retries and competing finalizations.
  PERFORM pg_advisory_xact_lock(hashtextextended('preauth-handoff:' || p_preauth_id::text,0));

  SELECT * INTO v_existing
  FROM public.preauthorization_submissions
  WHERE preauth_id=p_preauth_id AND idempotency_key=p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    SELECT * INTO v_version
    FROM public.preauthorization_versions
    WHERE id=v_existing.version_id AND preauth_id=p_preauth_id;
    IF NOT FOUND OR coalesce(v_version.fingerprint,'') <> v_hash THEN
      RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_MISMATCH' USING errcode='22023';
    END IF;

    SELECT * INTO v_document
    FROM public.preauth_document_registry
    WHERE preauth_id=p_preauth_id AND version_number=v_version.version_number;
    IF NOT FOUND THEN RAISE EXCEPTION 'IDEMPOTENCY_RECORD_INCOMPLETE' USING errcode='P0001'; END IF;

    SELECT * INTO v_handoff
    FROM public.preauth_handoff_log
    WHERE document_id=v_document.id AND idempotency_key=p_idempotency_key;
    IF NOT FOUND THEN RAISE EXCEPTION 'IDEMPOTENCY_RECORD_INCOMPLETE' USING errcode='P0001'; END IF;

    RETURN jsonb_build_object(
      'version_id',v_version.id,
      'version_number',v_version.version_number,
      'submission_id',v_existing.id,
      'document_id',v_document.id,
      'handoff_id',v_handoff.id,
      'status','prepared',
      'idempotent',true
    );
  END IF;

  IF nullif(trim(coalesce(v_row.duplicate_signature,'')),'') IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_row.facility_id::text || ':' || v_row.duplicate_signature,0));
    IF EXISTS (
      SELECT 1 FROM public.pre_authorizations
      WHERE facility_id=v_row.facility_id
        AND duplicate_signature=v_row.duplicate_signature
        AND id<>v_row.id
        AND status IN ('draft','prepared')
    ) THEN
      RAISE EXCEPTION 'DUPLICATE_PREAUTH' USING errcode='23505';
    END IF;
  END IF;

  v_version_number := greatest(
    coalesce(v_row.document_revision,0),
    coalesce(v_row.version,0),
    coalesce((SELECT max(version_number) FROM public.preauthorization_versions WHERE preauth_id=p_preauth_id),0)
  ) + 1;
  v_document_name := coalesce(nullif(trim(v_row.request_number),''),'pre-authorization-'||p_preauth_id::text)
    || '-revision-' || v_version_number::text;
  v_attachment_name := v_document_name || '.pdf';

  INSERT INTO public.preauthorization_versions(
    preauth_id,version_number,action,snapshot,fingerprint,created_by,facility_id
  ) VALUES (
    p_preauth_id,v_version_number,'prepared',p_snapshot,v_hash,v_uid,v_row.facility_id
  ) RETURNING * INTO v_version;

  v_document := security_internal.register_preauth_document(
    p_preauth_id,v_version_number,p_snapshot,v_document_name,v_row.facility_id
  );
  v_handoff := security_internal.prepare_preauth_handoff(
    v_document.id,v_document.snapshot_hash,p_idempotency_key,p_recipient_manifest,
    coalesce(p_subject,''),coalesce(p_message_body,''),v_attachment_name
  );

  v_manifest := coalesce(p_attachment_manifest,'[]'::jsonb);
  IF jsonb_array_length(v_manifest)=0 THEN
    v_manifest := jsonb_build_array(jsonb_build_object(
      'type','pdf','name',v_attachment_name,'mimeType','application/pdf',
      'sizeBytes',null,'storagePath',null
    ));
  END IF;

  INSERT INTO public.preauthorization_submissions(
    preauth_id,version_id,idempotency_key,submission_channel,status,
    recipient_manifest,attachment_manifest,subject,message_body,
    submitted_by,prepared_at,facility_id
  ) VALUES (
    p_preauth_id,v_version.id,p_idempotency_key,'email','prepared',
    p_recipient_manifest,v_manifest,coalesce(p_subject,''),coalesce(p_message_body,''),
    v_uid,now(),v_row.facility_id
  ) RETURNING * INTO v_submission;

  UPDATE public.pre_authorizations
  SET document_revision=v_version_number,
      document_payload=p_snapshot,
      document_finalized_at=coalesce(document_finalized_at,now()),
      current_state='Email handoff prepared'
  WHERE id=p_preauth_id;

  RETURN jsonb_build_object(
    'version_id',v_version.id,
    'version_number',v_version_number,
    'submission_id',v_submission.id,
    'document_id',v_document.id,
    'handoff_id',v_handoff.id,
    'status','prepared',
    'idempotent',false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_preauthorization_handoff(
  p_preauth_id uuid,p_snapshot jsonb,p_total_cost numeric,
  p_recipient_manifest jsonb,p_attachment_manifest jsonb,
  p_subject text,p_message_body text,p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT security_internal.finalize_preauthorization_handoff($1,$2,$3,$4,$5,$6,$7,$8);
$function$;

REVOKE ALL ON FUNCTION security_internal.finalize_preauthorization_handoff(uuid,jsonb,numeric,jsonb,jsonb,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION security_internal.finalize_preauthorization_handoff(uuid,jsonb,numeric,jsonb,jsonb,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.finalize_preauthorization_handoff(uuid,jsonb,numeric,jsonb,jsonb,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_preauthorization_handoff(uuid,jsonb,numeric,jsonb,jsonb,text,text,text) TO authenticated;

COMMENT ON FUNCTION public.finalize_preauthorization_handoff(uuid,jsonb,numeric,jsonb,jsonb,text,text,text)
IS 'Freezes an immutable pre-authorization document revision and records a prepared email handoff package for officer review; does not send or submit to an insurer.';
