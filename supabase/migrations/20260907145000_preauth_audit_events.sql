-- Provider-neutral audit trail for the Pre-Authorization lifecycle.

CREATE TABLE IF NOT EXISTS public.preauth_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preauth_id UUID NOT NULL REFERENCES public.pre_authorizations(id) ON DELETE CASCADE,
  version_number INTEGER,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  idempotency_key TEXT,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS preauth_audit_request_time_idx
  ON public.preauth_audit_events(preauth_id, created_at DESC);

CREATE INDEX IF NOT EXISTS preauth_audit_type_time_idx
  ON public.preauth_audit_events(event_type, created_at DESC);

ALTER TABLE public.preauth_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS preauth_audit_events_select_authenticated ON public.preauth_audit_events;
CREATE POLICY preauth_audit_events_select_authenticated
  ON public.preauth_audit_events FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

REVOKE INSERT, UPDATE, DELETE ON public.preauth_audit_events FROM anon, authenticated;

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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.preauth_audit_events;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  IF p_preauth_id IS NULL OR p_event_type IS NULL OR length(trim(p_event_type)) = 0 THEN
    RAISE EXCEPTION 'INVALID_AUDIT_EVENT';
  END IF;

  INSERT INTO public.preauth_audit_events (
    preauth_id, version_number, event_type, from_status, to_status,
    actor_id, idempotency_key, reason, metadata
  ) VALUES (
    p_preauth_id, p_version_number, trim(p_event_type),
    NULLIF(trim(p_from_status), ''), NULLIF(trim(p_to_status), ''),
    (select auth.uid()), NULLIF(trim(p_idempotency_key), ''),
    NULLIF(trim(p_reason), ''), coalesce(p_metadata, '{}'::jsonb)
  ) RETURNING * INTO v_event;

  RETURN v_event;
END;
$$;

REVOKE ALL ON FUNCTION public.record_preauth_audit_event(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_preauth_audit_event(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_preauth_audit_event(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
