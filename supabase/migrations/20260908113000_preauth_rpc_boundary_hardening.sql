-- Harden privileged Pre-Authorization RPCs and child-item tenancy boundaries.
-- SECURITY DEFINER functions must re-check the facility boundary because their owner
-- context can bypass table RLS. Child charge rows inherit access from their parent request.

ALTER TABLE public.preauth_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read preauth_items" ON public.preauth_items;
DROP POLICY IF EXISTS "Authenticated insert preauth_items" ON public.preauth_items;
DROP POLICY IF EXISTS "Authenticated update preauth_items" ON public.preauth_items;
DROP POLICY IF EXISTS "Authenticated delete preauth_items" ON public.preauth_items;
DROP POLICY IF EXISTS preauth_items_select_facility ON public.preauth_items;
DROP POLICY IF EXISTS preauth_items_insert_facility ON public.preauth_items;
DROP POLICY IF EXISTS preauth_items_update_facility ON public.preauth_items;
DROP POLICY IF EXISTS preauth_items_delete_facility ON public.preauth_items;

CREATE POLICY preauth_items_select_facility ON public.preauth_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.pre_authorizations p
      WHERE p.id = preauth_items.preauth_id
        AND p.facility_id IS NOT NULL
        AND public.user_has_facility_access(p.facility_id)
    )
  );

CREATE POLICY preauth_items_insert_facility ON public.preauth_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.pre_authorizations p
      WHERE p.id = preauth_items.preauth_id
        AND p.facility_id IS NOT NULL
        AND public.user_has_facility_access(p.facility_id)
    )
  );

CREATE POLICY preauth_items_update_facility ON public.preauth_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.pre_authorizations p
      WHERE p.id = preauth_items.preauth_id
        AND p.facility_id IS NOT NULL
        AND public.user_has_facility_access(p.facility_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.pre_authorizations p
      WHERE p.id = preauth_items.preauth_id
        AND p.facility_id IS NOT NULL
        AND public.user_has_facility_access(p.facility_id)
    )
  );

CREATE POLICY preauth_items_delete_facility ON public.preauth_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.pre_authorizations p
      WHERE p.id = preauth_items.preauth_id
        AND p.facility_id IS NOT NULL
        AND public.user_has_facility_access(p.facility_id)
    )
  );

-- Do not allow unauthenticated callers to reach charge rows.
REVOKE ALL ON public.preauth_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.preauth_items TO authenticated;

CREATE OR REPLACE FUNCTION public.preauth_snapshot(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_header JSONB;
  v_items JSONB;
  v_facility UUID;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT p.facility_id, to_jsonb(p) - 'created_by'
    INTO v_facility, v_header
    FROM public.pre_authorizations p
   WHERE p.id = p_id;

  IF v_header IS NULL THEN
    RAISE EXCEPTION 'PREAUTH_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_facility IS NULL OR NOT public.user_has_facility_access(v_facility) THEN
    RAISE EXCEPTION 'FACILITY_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id), '[]'::jsonb)
    INTO v_items
    FROM public.preauth_items i
   WHERE i.preauth_id = p_id;

  RETURN jsonb_build_object('request', v_header, 'items', v_items);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_preauth_version(
  p_preauth_id UUID,
  p_action TEXT DEFAULT 'created'
)
RETURNS public.preauthorization_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_version INTEGER;
  v_snapshot JSONB;
  v_row public.preauthorization_versions;
  v_facility UUID;
  v_action TEXT;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT facility_id INTO v_facility
    FROM public.pre_authorizations
   WHERE id = p_preauth_id;

  IF v_facility IS NULL THEN
    RAISE EXCEPTION 'PREAUTH_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.user_has_facility_access(v_facility) THEN
    RAISE EXCEPTION 'FACILITY_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  v_action := nullif(trim(coalesce(p_action, '')), '');
  IF v_action IS NULL THEN v_action := 'amended'; END IF;
  IF length(v_action) > 100 THEN
    RAISE EXCEPTION 'INVALID_VERSION_ACTION';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('preauth-version:' || p_preauth_id::text, 0)
  );

  SELECT coalesce(max(version_number), 0) + 1
    INTO v_version
    FROM public.preauthorization_versions
   WHERE preauth_id = p_preauth_id;

  v_snapshot := public.preauth_snapshot(p_preauth_id);

  INSERT INTO public.preauthorization_versions(
    preauth_id, version_number, action, snapshot, fingerprint, created_by, facility_id
  )
  VALUES(
    p_preauth_id,
    v_version,
    v_action,
    v_snapshot,
    (v_snapshot->'request'->>'dedup_fingerprint'),
    (select auth.uid()),
    v_facility
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_preauthorization(
  p_preauth_id UUID,
  p_channel TEXT,
  p_idempotency_key TEXT,
  p_recipient TEXT DEFAULT NULL
)
RETURNS public.preauth_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_p public.pre_authorizations;
  v_version INTEGER;
  v_row public.preauth_submissions;
  v_facility UUID;
  v_channel TEXT;
  v_key TEXT;
  v_recipient TEXT;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  v_channel := lower(nullif(trim(coalesce(p_channel, '')), ''));
  v_key := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_recipient := nullif(trim(coalesce(p_recipient, '')), '');

  IF v_channel IS NULL OR v_channel NOT IN ('email', 'portal', 'api') THEN
    RAISE EXCEPTION 'INVALID_SUBMISSION_CHANNEL';
  END IF;
  IF v_key IS NULL OR length(v_key) > 200 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;
  IF v_recipient IS NOT NULL AND length(v_recipient) > 320 THEN
    RAISE EXCEPTION 'INVALID_RECIPIENT';
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

  PERFORM pg_advisory_xact_lock(
    hashtextextended('preauth-submit:' || p_preauth_id::text || ':' || v_key, 0)
  );

  SELECT coalesce(max(version_number), 0)
    INTO v_version
    FROM public.preauthorization_versions
   WHERE preauth_id = p_preauth_id;

  IF v_version = 0 THEN
    PERFORM public.create_preauth_version(p_preauth_id, 'created');
    SELECT max(version_number)
      INTO v_version
      FROM public.preauthorization_versions
     WHERE preauth_id = p_preauth_id;
  END IF;

  INSERT INTO public.preauth_submissions(
    preauth_id, version_number, channel, idempotency_key, recipient, submitted_by, facility_id
  )
  VALUES(
    p_preauth_id, v_version, v_channel, v_key, v_recipient, (select auth.uid()), v_facility
  )
  ON CONFLICT (preauth_id, idempotency_key) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row
      FROM public.preauth_submissions
     WHERE preauth_id = p_preauth_id
       AND idempotency_key = v_key;
  END IF;

  -- Critical fix: update only the requested pre-authorization, never every row.
  UPDATE public.pre_authorizations
     SET status = CASE
       WHEN lower(coalesce(status, '')) IN ('pending', 'draft', 'review', 'ready')
       THEN 'submitted'
       ELSE status
     END
   WHERE public.pre_authorizations.id = p_preauth_id;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.preauth_snapshot(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_preauth_version(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_preauthorization(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preauth_snapshot(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_preauth_version(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_preauthorization(UUID, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.preauth_snapshot(UUID) IS
  'Returns a facility-authorized immutable-style snapshot; SECURITY DEFINER re-checks tenancy explicitly.';
COMMENT ON FUNCTION public.create_preauth_version(UUID, TEXT) IS
  'Creates a facility-authorized immutable pre-authorization revision under an advisory lock.';
COMMENT ON FUNCTION public.submit_preauthorization(UUID, TEXT, TEXT, TEXT) IS
  'Creates an idempotent facility-scoped submission record and updates only the requested pre-authorization.';
