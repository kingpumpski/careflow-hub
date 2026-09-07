-- Provider-neutral submission lifecycle: queued -> processing -> submitted/failed,
-- with idempotency and explicit retry semantics.

ALTER TABLE public.preauth_submissions
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failure_code TEXT,
  ADD COLUMN IF NOT EXISTS attempt_limit INTEGER NOT NULL DEFAULT 5;

CREATE INDEX IF NOT EXISTS preauth_submissions_queue_idx
  ON public.preauth_submissions(status, next_attempt_at)
  WHERE status IN ('queued','failed');

DROP FUNCTION IF EXISTS public.submit_preauthorization(UUID,TEXT,TEXT,TEXT);
CREATE FUNCTION public.submit_preauthorization(
  p_preauth_id UUID,
  p_channel TEXT,
  p_idempotency_key TEXT,
  p_recipient TEXT DEFAULT NULL
)
RETURNS public.preauth_submissions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_p public.pre_authorizations;
  v_version INTEGER;
  v_row public.preauth_submissions;
BEGIN
  IF (select auth.uid()) IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF nullif(trim(p_channel),'') IS NULL OR nullif(trim(p_idempotency_key),'') IS NULL THEN RAISE EXCEPTION 'SUBMISSION_INPUT_REQUIRED'; END IF;
  SELECT * INTO v_p FROM public.pre_authorizations WHERE id=p_preauth_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PREAUTH_NOT_FOUND'; END IF;
  IF v_p.facility_id IS NULL OR NOT public.user_has_facility_access(v_p.facility_id) THEN RAISE EXCEPTION 'FACILITY_ACCESS_DENIED' USING ERRCODE='42501'; END IF;

  SELECT max(version_number) INTO v_version FROM public.preauthorization_versions WHERE preauth_id=p_preauth_id;
  IF v_version IS NULL THEN
    SELECT (public.create_preauth_version(p_preauth_id,'created')).version_number INTO v_version;
  END IF;

  INSERT INTO public.preauth_submissions(facility_id,preauth_id,version_number,channel,status,idempotency_key,recipient,submitted_by,next_attempt_at)
  VALUES(v_p.facility_id,p_preauth_id,v_version,trim(p_channel),'queued',trim(p_idempotency_key),nullif(trim(p_recipient),''),(select auth.uid()),now())
  ON CONFLICT (preauth_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
  RETURNING * INTO v_row;

  UPDATE public.pre_authorizations p
  SET status=CASE WHEN lower(coalesce(p.status,'')) IN ('pending','draft','review','ready','pending_review') THEN 'submitted' ELSE p.status END
  WHERE p.id=p_preauth_id;

  PERFORM public.record_preauth_audit_event(p_preauth_id,'submission_queued',v_version,NULL,'submitted',p_idempotency_key,NULL,jsonb_build_object('channel',trim(p_channel)));
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_preauthorization(UUID,TEXT,TEXT,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_preauthorization(UUID,TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.process_preauth_submission(p_submission_id UUID)
RETURNS public.preauth_submissions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.preauth_submissions;
BEGIN
  IF (select auth.uid()) IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_row FROM public.preauth_submissions WHERE id=p_submission_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUBMISSION_NOT_FOUND'; END IF;
  IF v_row.facility_id IS NULL OR NOT public.user_has_facility_access(v_row.facility_id) THEN RAISE EXCEPTION 'FACILITY_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF v_row.status NOT IN ('queued','failed') THEN RETURN v_row; END IF;
  IF coalesce(v_row.next_attempt_at,now()) > now() THEN RAISE EXCEPTION 'SUBMISSION_NOT_DUE'; END IF;
  IF v_row.retry_count >= v_row.attempt_limit THEN RAISE EXCEPTION 'SUBMISSION_ATTEMPT_LIMIT'; END IF;

  UPDATE public.preauth_submissions SET status='processing',last_attempt_at=now(),retry_count=retry_count+1 WHERE id=p_submission_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.process_preauth_submission(UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.process_preauth_submission(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_preauth_submission(p_submission_id UUID,p_external_reference TEXT DEFAULT NULL,p_provider_message TEXT DEFAULT NULL)
RETURNS public.preauth_submissions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.preauth_submissions;
BEGIN
  IF (select auth.uid()) IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_row FROM public.preauth_submissions WHERE id=p_submission_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUBMISSION_NOT_FOUND'; END IF;
  IF v_row.facility_id IS NULL OR NOT public.user_has_facility_access(v_row.facility_id) THEN RAISE EXCEPTION 'FACILITY_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  UPDATE public.preauth_submissions SET status='submitted',external_reference=nullif(trim(p_external_reference),''),provider_message=nullif(trim(p_provider_message),''),completed_at=now(),next_attempt_at=NULL,failure_code=NULL WHERE id=p_submission_id RETURNING * INTO v_row;
  PERFORM public.record_preauth_audit_event(v_row.preauth_id,'submission_completed',v_row.version_number,'submitted','submitted',NULL,NULL,jsonb_build_object('submission_id',v_row.id,'external_reference',v_row.external_reference));
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_preauth_submission(UUID,TEXT,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_preauth_submission(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.fail_preauth_submission(p_submission_id UUID,p_failure_code TEXT,p_provider_message TEXT DEFAULT NULL)
RETURNS public.preauth_submissions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.preauth_submissions; v_delay INTEGER;
BEGIN
  IF (select auth.uid()) IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_row FROM public.preauth_submissions WHERE id=p_submission_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUBMISSION_NOT_FOUND'; END IF;
  IF v_row.facility_id IS NULL OR NOT public.user_has_facility_access(v_row.facility_id) THEN RAISE EXCEPTION 'FACILITY_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  v_delay := least(3600, greatest(30, (2 ^ least(v_row.retry_count,6))::integer * 30));
  UPDATE public.preauth_submissions SET status='failed',failure_code=nullif(trim(p_failure_code),''),provider_message=nullif(trim(p_provider_message),''),next_attempt_at=CASE WHEN retry_count < attempt_limit THEN now() + make_interval(secs=>v_delay) ELSE NULL END,completed_at=NULL WHERE id=p_submission_id RETURNING * INTO v_row;
  PERFORM public.record_preauth_audit_event(v_row.preauth_id,'submission_failed',v_row.version_number,'submitted','submitted',NULL,p_failure_code,jsonb_build_object('submission_id',v_row.id,'retry_count',v_row.retry_count,'retry_at',v_row.next_attempt_at));
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.fail_preauth_submission(UUID,TEXT,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fail_preauth_submission(UUID,TEXT,TEXT) TO authenticated;
