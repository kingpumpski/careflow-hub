-- Security hardening for the document-first pre-authorization handoff lifecycle.
-- Ensures lifecycle records inherit the parent facility, cross-record references
-- cannot cross tenant/request boundaries, and authenticated users cannot mutate
-- frozen revisions or prepared handoff/audit records after insertion.

ALTER TABLE public.preauthorization_submissions
  ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id) ON DELETE RESTRICT;
ALTER TABLE public.preauthorization_audit_events
  ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_preauthorization_submissions_facility
  ON public.preauthorization_submissions(facility_id, prepared_at DESC);
CREATE INDEX IF NOT EXISTS idx_preauthorization_audit_facility
  ON public.preauthorization_audit_events(facility_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.secure_preauthorization_lifecycle_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_facility_id uuid;
  v_version_preauth_id uuid;
  v_version_facility_id uuid;
  v_submission_preauth_id uuid;
  v_submission_facility_id uuid;
BEGIN
  SELECT p.facility_id
    INTO v_facility_id
    FROM public.pre_authorizations p
   WHERE p.id = NEW.preauth_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PREAUTH_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  IF NEW.facility_id IS NULL THEN
    NEW.facility_id := v_facility_id;
  ELSIF NEW.facility_id IS DISTINCT FROM v_facility_id THEN
    RAISE EXCEPTION 'PREAUTH_FACILITY_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF (select auth.uid()) IS NOT NULL THEN
    IF NEW.facility_id IS NULL OR NOT public.user_has_facility_access(NEW.facility_id) THEN
      RAISE EXCEPTION 'FACILITY_ACCESS_DENIED' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_TABLE_NAME IN ('preauthorization_submissions', 'preauthorization_audit_events')
     AND NEW.version_id IS NOT NULL THEN
    SELECT v.preauth_id, v.facility_id
      INTO v_version_preauth_id, v_version_facility_id
      FROM public.preauthorization_versions v
     WHERE v.id = NEW.version_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PREAUTH_VERSION_NOT_FOUND' USING ERRCODE = '23503';
    END IF;

    IF v_version_preauth_id IS DISTINCT FROM NEW.preauth_id
       OR v_version_facility_id IS DISTINCT FROM NEW.facility_id THEN
      RAISE EXCEPTION 'PREAUTH_VERSION_BOUNDARY_MISMATCH' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'preauthorization_audit_events' AND NEW.submission_id IS NOT NULL THEN
    SELECT s.preauth_id, s.facility_id
      INTO v_submission_preauth_id, v_submission_facility_id
      FROM public.preauthorization_submissions s
     WHERE s.id = NEW.submission_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PREAUTH_HANDOFF_NOT_FOUND' USING ERRCODE = '23503';
    END IF;

    IF v_submission_preauth_id IS DISTINCT FROM NEW.preauth_id
       OR v_submission_facility_id IS DISTINCT FROM NEW.facility_id THEN
      RAISE EXCEPTION 'PREAUTH_HANDOFF_BOUNDARY_MISMATCH' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.secure_preauthorization_lifecycle_insert() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_secure_preauthorization_version_insert ON public.preauthorization_versions;
CREATE TRIGGER trg_secure_preauthorization_version_insert
BEFORE INSERT ON public.preauthorization_versions
FOR EACH ROW EXECUTE FUNCTION public.secure_preauthorization_lifecycle_insert();

DROP TRIGGER IF EXISTS trg_secure_preauthorization_submission_insert ON public.preauthorization_submissions;
CREATE TRIGGER trg_secure_preauthorization_submission_insert
BEFORE INSERT ON public.preauthorization_submissions
FOR EACH ROW EXECUTE FUNCTION public.secure_preauthorization_lifecycle_insert();

DROP TRIGGER IF EXISTS trg_secure_preauthorization_audit_insert ON public.preauthorization_audit_events;
CREATE TRIGGER trg_secure_preauthorization_audit_insert
BEFORE INSERT ON public.preauthorization_audit_events
FOR EACH ROW EXECUTE FUNCTION public.secure_preauthorization_lifecycle_insert();

ALTER TABLE public.preauthorization_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preauthorization_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preauthorization_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated manage preauth versions" ON public.preauthorization_versions;
DROP POLICY IF EXISTS "Authenticated create preauth versions" ON public.preauthorization_versions;
DROP POLICY IF EXISTS preauth_versions_select_facility ON public.preauthorization_versions;
CREATE POLICY preauth_versions_select_facility ON public.preauthorization_versions
  FOR SELECT TO authenticated
  USING (
    (facility_id IS NOT NULL AND public.user_has_facility_access(facility_id))
    OR (facility_id IS NULL AND created_by = (select auth.uid()))
  );
CREATE POLICY preauth_versions_insert_facility ON public.preauthorization_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    facility_id IS NOT NULL
    AND public.user_has_facility_access(facility_id)
    AND created_by = (select auth.uid())
  );

DROP POLICY IF EXISTS "Authenticated manage preauth submissions" ON public.preauthorization_submissions;
DROP POLICY IF EXISTS preauthorization_submissions_select_facility ON public.preauthorization_submissions;
CREATE POLICY preauthorization_submissions_select_facility ON public.preauthorization_submissions
  FOR SELECT TO authenticated
  USING (
    (facility_id IS NOT NULL AND public.user_has_facility_access(facility_id))
    OR (facility_id IS NULL AND submitted_by = (select auth.uid()))
  );
CREATE POLICY preauthorization_submissions_insert_facility ON public.preauthorization_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    facility_id IS NOT NULL
    AND public.user_has_facility_access(facility_id)
    AND submitted_by = (select auth.uid())
    AND status = 'prepared'
  );

DROP POLICY IF EXISTS "Authenticated manage preauth audit" ON public.preauthorization_audit_events;
DROP POLICY IF EXISTS preauthorization_audit_events_select_facility ON public.preauthorization_audit_events;
CREATE POLICY preauthorization_audit_events_select_facility ON public.preauthorization_audit_events
  FOR SELECT TO authenticated
  USING (
    (facility_id IS NOT NULL AND public.user_has_facility_access(facility_id))
    OR (facility_id IS NULL AND actor_id = (select auth.uid()))
  );
CREATE POLICY preauthorization_audit_events_insert_facility ON public.preauthorization_audit_events
  FOR INSERT TO authenticated
  WITH CHECK (
    facility_id IS NOT NULL
    AND public.user_has_facility_access(facility_id)
    AND actor_id = (select auth.uid())
  );

REVOKE ALL ON public.preauthorization_versions FROM anon;
REVOKE ALL ON public.preauthorization_submissions FROM anon;
REVOKE ALL ON public.preauthorization_audit_events FROM anon;

REVOKE UPDATE, DELETE ON public.preauthorization_versions FROM authenticated;
REVOKE UPDATE, DELETE ON public.preauthorization_submissions FROM authenticated;
REVOKE UPDATE, DELETE ON public.preauthorization_audit_events FROM authenticated;

GRANT SELECT, INSERT ON public.preauthorization_versions TO authenticated;
GRANT SELECT, INSERT ON public.preauthorization_submissions TO authenticated;
GRANT SELECT, INSERT ON public.preauthorization_audit_events TO authenticated;

COMMENT ON COLUMN public.preauthorization_submissions.facility_id IS
  'Facility/tenant inherited from the parent pre-authorization request at insert time.';
COMMENT ON COLUMN public.preauthorization_audit_events.facility_id IS
  'Facility/tenant inherited from the parent pre-authorization request at insert time.';
