-- Capture the complete request snapshot after all statements in the transaction finish.
-- A deferred constraint trigger prevents parent/item update ordering from producing partial versions.

DROP TRIGGER IF EXISTS trg_capture_preauth_version ON public.pre_authorizations;

CREATE OR REPLACE FUNCTION public.capture_preauth_version_deferred()
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

  -- One version per transaction/request. This also prevents multiple parent updates
  -- in one transaction from producing misleading intermediate versions.
  IF EXISTS (
    SELECT 1
      FROM public.preauthorization_versions
     WHERE preauth_id = NEW.id
       AND created_at >= transaction_timestamp()
  ) THEN
    RETURN NEW;
  END IF;

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

CREATE CONSTRAINT TRIGGER trg_capture_preauth_version
AFTER INSERT OR UPDATE ON public.pre_authorizations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.capture_preauth_version_deferred();
