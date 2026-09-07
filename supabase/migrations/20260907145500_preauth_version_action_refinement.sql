-- Version records describe why a snapshot exists. The snapshot itself remains
-- the complete authoritative request state at the end of the transaction.

CREATE OR REPLACE FUNCTION public.capture_preauth_version_deferred()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_version INTEGER;
  v_action TEXT;
  v_snapshot JSONB;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('preauth-version:' || NEW.id::TEXT, 0));

  IF EXISTS (
    SELECT 1 FROM public.preauthorization_versions v
    WHERE v.preauth_id = NEW.id AND v.created_at >= transaction_timestamp()
  ) THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(max(version_number), 0) + 1 INTO v_version
  FROM public.preauthorization_versions WHERE preauth_id = NEW.id;

  v_action := CASE
    WHEN TG_OP = 'INSERT' THEN 'created'
    WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'status_transition'
    ELSE 'amended'
  END;

  SELECT to_jsonb(p) - 'created_by' - 'updated_by' ||
         jsonb_build_object('items', coalesce((
           SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id)
           FROM public.preauth_items i WHERE i.preauth_id = NEW.id
         ), '[]'::jsonb))
  INTO v_snapshot
  FROM public.pre_authorizations p WHERE p.id = NEW.id;

  INSERT INTO public.pre_authorization_versions (
    preauth_id, version_number, action, snapshot, fingerprint, created_by
  ) VALUES (
    NEW.id, v_version, v_action, v_snapshot,
    md5(v_snapshot::TEXT), (select auth.uid())
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_preauth_version ON public.pre_authorizations;
CREATE CONSTRAINT TRIGGER trg_capture_preauth_version
AFTER INSERT OR UPDATE ON public.pre_authorizations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.capture_preauth_version_deferred();
