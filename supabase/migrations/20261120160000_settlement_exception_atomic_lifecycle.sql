-- Online settlement exception detection and lifecycle transitions.
-- All online state changes and audit events are committed atomically.
CREATE OR REPLACE FUNCTION public.record_settlement_exception(
  p_settlement_period_id uuid,
  p_type text,
  p_severity text,
  p_title text,
  p_description text,
  p_detected_at timestamptz DEFAULT now()
)
RETURNS public.settlement_exceptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_facility_id uuid;
  v_exception public.settlement_exceptions%rowtype;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.current_user_has_permission('payments.write') THEN
    RAISE EXCEPTION 'PAYMENTS_WRITE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_type NOT IN ('payment_variance','rejection_variance','withholding_tax_variance','missing_payment_advice','incomplete_payment_advice','overdue_settlement')
     OR p_severity NOT IN ('info','warning','critical')
     OR nullif(trim(coalesce(p_title,'')),'') IS NULL
     OR nullif(trim(coalesce(p_description,'')),'') IS NULL THEN
    RAISE EXCEPTION 'INVALID_SETTLEMENT_EXCEPTION' USING ERRCODE = '22023';
  END IF;

  SELECT facility_id INTO v_facility_id
  FROM public.claims_settlement_periods
  WHERE id = p_settlement_period_id
  FOR UPDATE;
  IF NOT FOUND OR v_facility_id IS NULL THEN
    RAISE EXCEPTION 'SETTLEMENT_PERIOD_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.user_has_facility_access(v_facility_id) THEN
    RAISE EXCEPTION 'FACILITY_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_exception
  FROM public.settlement_exceptions
  WHERE settlement_period_id = p_settlement_period_id
    AND type = p_type
  ORDER BY detected_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_exception.status IN ('open','under_review') THEN
      UPDATE public.settlement_exceptions
      SET severity = p_severity,
          title = trim(p_title),
          description = trim(p_description),
          detected_at = coalesce(p_detected_at, now()),
          updated_at = now()
      WHERE id = v_exception.id
      RETURNING * INTO v_exception;
      RETURN v_exception;
    END IF;
    -- Do not reopen an unchanged resolved/waived exception on every refresh.
    -- A materially changed detection creates a new lifecycle record instead.
    IF v_exception.severity = p_severity
       AND v_exception.title = trim(p_title)
       AND v_exception.description = trim(p_description) THEN
      RETURN v_exception;
    END IF;
  END IF;

  INSERT INTO public.settlement_exceptions(
    facility_id, settlement_period_id, type, severity, status,
    title, description, detected_at
  )
  VALUES (
    v_facility_id, p_settlement_period_id, p_type, p_severity, 'open',
    trim(p_title), trim(p_description), coalesce(p_detected_at, now())
  )
  RETURNING * INTO v_exception;

  INSERT INTO public.settlement_exception_audit_events(
    facility_id, exception_id, event_type, actor_id, occurred_at,
    before_status, after_status, note
  )
  VALUES (
    v_facility_id, v_exception.id, 'created', auth.uid(), now(),
    NULL, 'open', 'Automatically detected from confirmed settlement-period data.'
  );

  RETURN v_exception;
END;
$function$;

CREATE OR REPLACE FUNCTION public.transition_settlement_exception_atomic(
  p_exception_id uuid,
  p_target_status text,
  p_note text
)
RETURNS public.settlement_exceptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_exception public.settlement_exceptions%rowtype;
  v_actor uuid := auth.uid();
  v_note text := nullif(trim(coalesce(p_note,'')), '');
  v_previous_status text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.current_user_has_permission('payments.write') THEN
    RAISE EXCEPTION 'PAYMENTS_WRITE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_target_status NOT IN ('open','under_review','resolved','waived') THEN
    RAISE EXCEPTION 'INVALID_SETTLEMENT_EXCEPTION_STATUS' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'SETTLEMENT_EXCEPTION_NOTE_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_exception
  FROM public.settlement_exceptions
  WHERE id = p_exception_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SETTLEMENT_EXCEPTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.user_has_facility_access(v_exception.facility_id) THEN
    RAISE EXCEPTION 'FACILITY_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF v_exception.status = p_target_status THEN
    RETURN v_exception;
  END IF;
  v_previous_status := v_exception.status;
  IF NOT (
    (v_exception.status = 'open' AND p_target_status IN ('under_review','waived'))
    OR (v_exception.status = 'under_review' AND p_target_status IN ('resolved','waived'))
  ) THEN
    RAISE EXCEPTION 'INVALID_SETTLEMENT_EXCEPTION_TRANSITION: % -> %', v_exception.status, p_target_status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.settlement_exceptions
  SET status = p_target_status,
      assigned_to = coalesce(assigned_to, v_actor),
      resolution_note = CASE WHEN p_target_status IN ('resolved','waived') THEN v_note ELSE resolution_note END,
      resolved_at = CASE WHEN p_target_status IN ('resolved','waived') THEN now() ELSE NULL END,
      resolved_by = CASE WHEN p_target_status IN ('resolved','waived') THEN v_actor ELSE NULL END,
      updated_at = now()
  WHERE id = p_exception_id
  RETURNING * INTO v_exception;

  INSERT INTO public.settlement_exception_audit_events(
    facility_id, exception_id, event_type, actor_id, occurred_at,
    before_status, after_status, note
  )
  VALUES (
    v_exception.facility_id, v_exception.id, 'status_changed', v_actor, now(),
    v_previous_status,
    p_target_status, v_note
  );

  RETURN v_exception;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_settlement_exception(uuid,text,text,text,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_settlement_exception(uuid,text,text,text,text,timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.transition_settlement_exception_atomic(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_settlement_exception_atomic(uuid,text,text) TO authenticated;

-- The lifecycle RPCs are the only supported online write path. The table's
-- facility RLS policies are read filters, not a substitute for write grants.
-- Prevent direct PostgREST writes that could bypass the atomic audit events.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.settlement_exceptions FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.settlement_exception_audit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.settlement_exceptions TO authenticated;
GRANT SELECT ON TABLE public.settlement_exception_audit_events TO authenticated;
