-- Canonical workflow transitions with compatibility for the application's
-- existing pending/review labels. UI code can adopt canonical states gradually.

CREATE OR REPLACE FUNCTION public.transition_preauthorization_status(
  p_preauth_id UUID,
  p_to_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.pre_authorizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.pre_authorizations;
  v_from TEXT;
  v_to TEXT := lower(trim(p_to_status));
  v_allowed BOOLEAN := false;
BEGIN
  IF (select auth.uid()) IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF v_to IS NULL OR v_to = '' THEN RAISE EXCEPTION 'STATUS_REQUIRED'; END IF;

  SELECT * INTO v_row FROM public.pre_authorizations WHERE id = p_preauth_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PREAUTH_NOT_FOUND'; END IF;
  v_from := lower(coalesce(v_row.status, 'draft'));

  v_allowed :=
    (v_from = 'draft' AND v_to IN ('pending','pending_review','cancelled')) OR
    (v_from = 'pending' AND v_to IN ('review','pending_review','ready','draft','cancelled')) OR
    (v_from IN ('review','pending_review') AND v_to IN ('ready','draft','cancelled')) OR
    (v_from = 'ready' AND v_to IN ('submitted','draft','cancelled')) OR
    (v_from = 'submitted' AND v_to IN ('approved','rejected','amended')) OR
    (v_from = 'approved' AND v_to IN ('amended','cancelled')) OR
    (v_from = 'rejected' AND v_to IN ('amended','cancelled')) OR
    (v_from = 'amended' AND v_to IN ('pending','pending_review','ready','submitted','cancelled')) OR
    (v_from = v_to);

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'INVALID_PREAUTH_STATUS_TRANSITION:%:%', v_from, v_to;
  END IF;

  UPDATE public.pre_authorizations
  SET status = v_to
  WHERE id = p_preauth_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_preauthorization_status(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_preauthorization_status(UUID, TEXT, TEXT) TO authenticated;
