-- Pre-Authorization enterprise lifecycle: immutable snapshots, atomic amendments,
-- controlled workflow transitions, and idempotent submission history.

CREATE TABLE IF NOT EXISTS public.preauthorization_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preauth_id UUID NOT NULL REFERENCES public.pre_authorizations(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  action TEXT NOT NULL DEFAULT 'created',
  snapshot JSONB NOT NULL,
  fingerprint TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (preauth_id, version_number)
);
CREATE INDEX IF NOT EXISTS preauth_versions_lookup_idx ON public.preauthorization_versions(preauth_id, version_number DESC);
ALTER TABLE public.pre_authorization_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS preauth_versions_select ON public.preauthorization_versions;
CREATE POLICY preauth_versions_select ON public.preauthorization_versions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE INSERT, UPDATE, DELETE ON public.preauthorization_versions FROM authenticated, anon;

CREATE TABLE IF NOT EXISTS public.preauth_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preauth_id UUID NOT NULL REFERENCES public.pre_authorizations(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  idempotency_key TEXT NOT NULL,
  recipient TEXT,
  external_reference TEXT,
  provider_message TEXT,
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  retry_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (preauth_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS preauth_submissions_lookup_idx ON public.preauth_submissions(preauth_id, submitted_at DESC);
ALTER TABLE public.preauth_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS preauth_submissions_select ON public.preauth_submissions;
CREATE POLICY preauth_submissions_select ON public.preauth_submissions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE INSERT, UPDATE, DELETE ON public.preauth_submissions FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.preauth_snapshot(p_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_header JSONB; v_items JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT to_jsonb(p) - 'created_by' INTO v_header FROM public.pre_authorizations p WHERE p.id = p_id;
  IF v_header IS NULL THEN RAISE EXCEPTION 'Pre-authorization not found' USING ERRCODE='P0002'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id), '[]'::jsonb) INTO v_items FROM public.preauth_items i WHERE i.preauth_id = p_id;
  RETURN jsonb_build_object('request', v_header, 'items', v_items);
END;
$$;
REVOKE ALL ON FUNCTION public.preauth_snapshot(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preauth_snapshot(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_preauth_version(p_preauth_id UUID, p_action TEXT DEFAULT 'created')
RETURNS public.preauthorization_versions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_version INTEGER; v_snapshot JSONB; v_row public.preauthorization_versions;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT coalesce(max(version_number),0)+1 INTO v_version FROM public.preauthorization_versions WHERE preauth_id=p_preauth_id;
  v_snapshot := public.preauth_snapshot(p_preauth_id);
  INSERT INTO public.preauthorization_versions(preauth_id,version_number,action,snapshot,fingerprint,created_by)
  VALUES(p_preauth_id,v_version,coalesce(nullif(trim(p_action),''),'amended'),v_snapshot,(v_snapshot->'request'->>'dedup_fingerprint'),auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.create_preauth_version(UUID,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_preauth_version(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_preauthorization(p_preauth_id UUID, p_channel TEXT, p_idempotency_key TEXT, p_recipient TEXT DEFAULT NULL)
RETURNS public.preauth_submissions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_p public.pre_authorizations; v_version INTEGER; v_row public.preauth_submissions;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF nullif(trim(p_channel),'') IS NULL OR nullif(trim(p_idempotency_key),'') IS NULL THEN RAISE EXCEPTION 'Submission channel and idempotency key are required'; END IF;
  SELECT * INTO v_p FROM public.pre_authorizations WHERE id=p_preauth_id FOR UPDATE;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'Pre-authorization not found' USING ERRCODE='P0002'; END IF;
  SELECT coalesce(max(version_number),0) INTO v_version FROM public.preauthorization_versions WHERE preauth_id=p_preauth_id;
  IF v_version=0 THEN PERFORM public.create_preauth_version(p_preauth_id,'created'); SELECT max(version_number) INTO v_version FROM public.preauthorization_versions WHERE preauth_id=p_preauth_id; END IF;
  INSERT INTO public.preauth_submissions(preauth_id,version_number,channel,idempotency_key,recipient,submitted_by)
  VALUES(p_preauth_id,v_version,trim(p_channel),trim(p_idempotency_key),nullif(trim(p_recipient),''),auth.uid())
  ON CONFLICT (preauth_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
  RETURNING * INTO v_row;
  UPDATE public.pre_authorizations SET status=CASE WHEN lower(coalesce(status,'')) IN ('pending','draft','review','ready') THEN 'submitted' ELSE status END WHERE id=id;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_preauthorization(UUID,TEXT,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_preauthorization(UUID,TEXT,TEXT,TEXT) TO authenticated;
