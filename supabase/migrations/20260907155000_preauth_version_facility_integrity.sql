-- Ensure every new immutable version carries the request's facility boundary.
CREATE OR REPLACE FUNCTION public.capture_preauth_version_deferred()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_next INTEGER; v_action TEXT; v_snapshot JSONB;
BEGIN
  IF (select auth.uid()) IS NULL OR NEW.facility_id IS NULL THEN RETURN NEW; END IF;
  IF NOT public.user_has_facility_access(NEW.facility_id) THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('preauth-version:' || NEW.id::text,0));
  IF EXISTS (SELECT 1 FROM public.preauthorization_versions WHERE preauth_id=NEW.id AND created_at>=transaction_timestamp()) THEN RETURN NEW; END IF;
  SELECT coalesce(max(version_number),0)+1 INTO v_next FROM public.preauthorization_versions WHERE preauth_id=NEW.id;
  v_action := CASE WHEN TG_OP='INSERT' THEN 'created' ELSE 'amended' END;
  SELECT jsonb_build_object('request',to_jsonb(p)-'created_by','items',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM public.preauth_items i WHERE i.preauth_id=p.id),'[]'::jsonb)) INTO v_snapshot FROM public.pre_authorizations p WHERE p.id=NEW.id;
  INSERT INTO public.preauthorization_versions(facility_id,preauth_id,version_number,action,snapshot,fingerprint,created_by)
  VALUES(NEW.facility_id,NEW.id,v_next,v_action,v_snapshot,v_snapshot->'request'->>'dedup_fingerprint',(select auth.uid()));
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.create_preauth_version(UUID,TEXT);
CREATE FUNCTION public.create_preauth_version(p_preauth_id UUID,p_action TEXT DEFAULT 'created')
RETURNS public.preauthorization_versions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_version INTEGER; v_snapshot JSONB; v_row public.preauthorization_versions; v_facility UUID;
BEGIN
  IF (select auth.uid()) IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT facility_id INTO v_facility FROM public.pre_authorizations WHERE id=p_preauth_id FOR UPDATE;
  IF v_facility IS NULL THEN RAISE EXCEPTION 'FACILITY_REQUIRED'; END IF;
  IF NOT public.user_has_facility_access(v_facility) THEN RAISE EXCEPTION 'FACILITY_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  SELECT coalesce(max(version_number),0)+1 INTO v_version FROM public.preauthorization_versions WHERE preauth_id=p_preauth_id;
  v_snapshot := public.preauth_snapshot(p_preauth_id);
  INSERT INTO public.preauthorization_versions(facility_id,preauth_id,version_number,action,snapshot,fingerprint,created_by)
  VALUES(v_facility,p_preauth_id,v_version,coalesce(nullif(trim(p_action),''),'amended'),v_snapshot,v_snapshot->'request'->>'dedup_fingerprint',(select auth.uid())) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.create_preauth_version(UUID,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_preauth_version(UUID,TEXT) TO authenticated;
