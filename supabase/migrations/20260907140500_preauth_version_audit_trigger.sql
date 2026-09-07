-- Complete the versioning boundary. Every persisted create/update receives an immutable snapshot.
-- This trigger is intentionally database-side so legacy UI paths cannot silently bypass history.

CREATE OR REPLACE FUNCTION public.capture_preauth_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_next INTEGER;
  v_action TEXT;
  v_snapshot JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('preauth-version:' || NEW.id::text, 0));

  SELECT coalesce(max(version_number), 0) + 1
    INTO v_next
    FROM public.preauthorization_versions
   WHERE preauth_id = NEW.id;

  v_action := CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'amended' END;

  SELECT jsonb_build_object(
    'request', to_jsonb(p) - 'created_by',
    'items', coalesce((
      SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id)
        FROM public.preauth_items i
       WHERE i.preauth_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_snapshot
  FROM public.pre_authorizations p
  WHERE p.id = NEW.id;

  INSERT INTO public.preauthorization_versions(
    preauth_id, version_number, action, snapshot, fingerprint, created_by
  ) VALUES (
    NEW.id, v_next, v_action, v_snapshot,
    v_snapshot->'request'->>'dedup_fingerprint', auth.uid()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_preauth_version ON public.pre_authorizations;
CREATE TRIGGER trg_capture_preauth_version
AFTER INSERT OR UPDATE ON public.pre_authorizations
FOR EACH ROW
EXECUTE FUNCTION public.capture_preauth_version();

-- Correct the submission status update so it only affects the requested record.
CREATE OR REPLACE FUNCTION public.submit_preauthorization(
  p_preauth_id UUID,
  p_channel TEXT,
  p_idempotency_key TEXT,
  p_recipient TEXT DEFAULT NULL
)
RETURNS public.preauth_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_p public.pre_authorizations;
  v_version INTEGER;
  v_row public.preauth_submissions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  IF nullif(trim(p_channel), '') IS NULL OR nullif(trim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'Submission channel and idempotency key are required';
  END IF;

  SELECT * INTO v_p
    FROM public.pre_authorizations
   WHERE id = p_preauth_id
   FOR UPDATE;
  IF v_p.id IS NULL THEN
    RAISE EXCEPTION 'Pre-authorization not found' USING ERRCODE='P0002';
  END IF;

  SELECT coalesce(max(version_number), 0)
    INTO v_version
    FROM public.preauthorization_versions
   WHERE preauth_id = p_preauth_id;
  IF v_version = 0 THEN
    RAISE EXCEPTION 'Pre-authorization has no immutable version' USING ERRCODE='P0001';
  END IF;

  INSERT INTO public.preauth_submissions(
    preauth_id, version_number, channel, idempotency_key, recipient, submitted_by
  ) VALUES (
    p_preauth_id, v_version, trim(p_channel), trim(p_idempotency_key),
    nullif(trim(p_recipient), ''), auth.uid()
  )
  ON CONFLICT (preauth_id, idempotency_key) DO UPDATE
    SET recipient = coalesce(EXCLUDED.recipient, public.preauth_submissions.recipient)
  RETURNING * INTO v_row;

  UPDATE public.pre_authorizations p
     SET status = CASE
       WHEN lower(coalesce(p.status, '')) IN ('pending', 'draft', 'review', 'ready') THEN 'submitted'
       ELSE p.status
     END
   WHERE p.id = p_preauth_id;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_preauthorization(UUID,TEXT,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_preauthorization(UUID,TEXT,TEXT,TEXT) TO authenticated;
