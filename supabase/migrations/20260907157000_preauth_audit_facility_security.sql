CREATE OR REPLACE FUNCTION public.record_preauth_audit_event(
  p_preauth_id UUID,
  p_event_type TEXT,
  p_version_number INTEGER DEFAULT NULL,
  p_from_status TEXT DEFAULT NULL,
  p_to_status TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS public.preauth_audit_events
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_event public.preauth_audit_events; v_facility UUID;
BEGIN
  IF (select auth.uid()) IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT facility_id INTO v_facility FROM public.pre_authorizations WHERE id=p_preauth_id;
  IF v_facility IS NULL OR NOT public.user_has_facility_access(v_facility) THEN RAISE EXCEPTION 'FACILITY_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF p_event_type IS NULL OR length(trim(p_event_type))=0 THEN RAISE EXCEPTION 'INVALID_AUDIT_EVENT'; END IF;
  INSERT INTO public.preauth_audit_events(facility_id,preauth_id,version_number,event_type,from_status,to_status,actor_id,idempotency_key,reason,metadata)
  VALUES(v_facility,p_preauth_id,p_version_number,trim(p_event_type),NULLIF(trim(p_from_status),''),NULLIF(trim(p_to_status),''),(select auth.uid()),NULLIF(trim(p_idempotency_key),''),NULLIF(trim(p_reason),''),coalesce(p_metadata,'{}'::jsonb))
  RETURNING * INTO v_event;
  RETURN v_event;
END;
$$;
REVOKE ALL ON FUNCTION public.record_preauth_audit_event(UUID,TEXT,INTEGER,TEXT,TEXT,TEXT,TEXT,JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_preauth_audit_event(UUID,TEXT,INTEGER,TEXT,TEXT,TEXT,TEXT,JSONB) TO authenticated;
