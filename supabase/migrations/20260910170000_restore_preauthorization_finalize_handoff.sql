CREATE OR REPLACE FUNCTION security_internal.finalize_preauthorization_handoff(p_preauth_id uuid, p_snapshot jsonb, p_total_cost numeric, p_recipient_manifest jsonb, p_attachment_manifest jsonb, p_subject text, p_message_body text, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.pre_authorizations%rowtype;
  v_existing public.preauth_submissions%rowtype;
  v_version public.preauthorization_versions%rowtype;
  v_document public.preauth_document_registry%rowtype;
  v_handoff public.preauth_handoff_log%rowtype;
  v_submission public.preauth_submissions%rowtype;
  v_version_number integer;
  v_hash text;
  v_document_name text;
  v_attachment_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode='42501'; END IF;
  IF NOT security_internal.current_user_has_permission('preauth.write') THEN RAISE EXCEPTION 'PREAUTH_WRITE_REQUIRED' USING errcode='42501'; END IF;
  IF length(trim(coalesce(p_idempotency_key,''))) < 8 OR length(p_idempotency_key) > 200 THEN RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY' USING errcode='22023'; END IF;
  IF jsonb_typeof(p_snapshot) <> 'object' THEN RAISE EXCEPTION 'INVALID_PREAUTH_SNAPSHOT' USING errcode='22023'; END IF;
  IF jsonb_typeof(p_recipient_manifest) <> 'array' OR jsonb_array_length(p_recipient_manifest)=0 THEN RAISE EXCEPTION 'HANDOFF_RECIPIENTS_REQUIRED' USING errcode='22023'; END IF;
  IF jsonb_typeof(coalesce(p_attachment_manifest,'[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'INVALID_ATTACHMENT_MANIFEST' USING errcode='22023'; END IF;
  SELECT * INTO v_row FROM public.pre_authorizations WHERE id=p_preauth_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PREAUTH_NOT_FOUND' USING errcode='P0002'; END IF;
  IF v_row.facility_id IS NULL THEN RAISE EXCEPTION 'FACILITY_REQUIRED'; END IF;
  IF NOT security_internal.user_has_facility_access(v_row.facility_id) THEN RAISE EXCEPTION 'FACILITY_ACCESS_DENIED' USING errcode='42501'; END IF;
  IF p_total_cost IS NULL OR p_total_cost <> v_row.total_cost THEN RAISE EXCEPTION 'TOTAL_COST_MISMATCH' USING errcode='22023'; END IF;
  SELECT * INTO v_existing FROM public.preauth_submissions WHERE preauth_id=p_preauth_id AND idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    SELECT * INTO v_document FROM public.preauth_document_registry WHERE preauth_id=p_preauth_id AND version_number=v_existing.version_number;
    SELECT * INTO v_handoff FROM public.preauth_handoff_log WHERE preauth_id=p_preauth_id AND version_number=v_existing.version_number AND idempotency_key=p_idempotency_key;
    RETURN jsonb_build_object('version_id',v_document.id,'version_number',v_existing.version_number,'submission_id',v_existing.id,'document_id',v_document.id,'handoff_id',v_handoff.id,'idempotent',true);
  END IF;
  v_version_number := greatest(coalesce(v_row.document_revision,0),coalesce(v_row.version,0),coalesce((SELECT max(version_number) FROM public.preauthorization_versions WHERE preauth_id=p_preauth_id),0))+1;
  v_hash := encode(extensions.digest(convert_to(p_snapshot::text,'UTF8'),'sha256'),'hex');
  v_document_name := coalesce(nullif(trim(v_row.request_number),''),'pre-authorization-'||p_preauth_id::text)||'-revision-'||v_version_number::text;
  v_attachment_name := v_document_name||'.pdf';
  INSERT INTO public.preauthorization_versions(preauth_id,version_number,action,snapshot,fingerprint,created_by,facility_id) VALUES(p_preauth_id,v_version_number,'prepared',p_snapshot,v_hash,v_uid,v_row.facility_id) RETURNING * INTO v_version;
  v_document := security_internal.register_preauth_document(p_preauth_id,v_version_number,p_snapshot,v_document_name,v_row.facility_id);
  v_handoff := security_internal.prepare_preauth_handoff(v_document.id,v_document.snapshot_hash,p_idempotency_key,p_recipient_manifest,coalesce(p_subject,''),coalesce(p_message_body,''),v_attachment_name);
  INSERT INTO public.pre_auth_submissions(preauth_id,version_number,channel,status,idempotency_key,recipient,submitted_by,facility_id) VALUES(p_preauth_id,v_version_number,'email','queued',p_idempotency_key,(SELECT elem->>'email' FROM jsonb_array_elements(p_recipient_manifest) elem WHERE elem->>'type'='to' LIMIT 1),v_uid,v_row.facility_id) RETURNING * INTO v_submission;
  UPDATE public.pre_authorizations SET document_revision=v_version_number,document_payload=p_snapshot,document_finalized_at=coalesce(document_finalized_at,now()) WHERE id=p_preauth_id;
  RETURN jsonb_build_object('version_id',v_version.id,'version_number',v_version_number,'submission_id',v_submission.id,'document_id',v_document.id,'handoff_id',v_handoff.id,'idempotent',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_preauthorization_handoff(p_preauth_id uuid,p_snapshot jsonb,p_total_cost numeric,p_recipient_manifest jsonb,p_attachment_manifest jsonb,p_subject text,p_message_body text,p_idempotency_key text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT security_internal.finalize_preauthorization_handoff($1,$2,$3,$4,$5,$6,$7,$8);
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_preauthorization_handoff(uuid,jsonb,numeric,jsonb,jsonb,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_preauthorization_handoff(uuid,jsonb,numeric,jsonb,jsonb,text,text,text) TO authenticated;
COMMENT ON FUNCTION public.finalize_preauthorization_handoff(uuid,jsonb,numeric,jsonb,jsonb,text,text,text) IS 'Atomically freezes a pre-authorization document revision and records an idempotent email handoff package.';
