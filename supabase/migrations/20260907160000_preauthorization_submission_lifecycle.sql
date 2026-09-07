-- Pre-Authorization Submission Lifecycle
-- Immutable revisions, delivery manifests, submissions, responses and audit events.

CREATE TABLE IF NOT EXISTS public.preauthorization_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preauth_id uuid NOT NULL REFERENCES public.pre_authorizations(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  snapshot jsonb NOT NULL,
  total_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  document_hash text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(preauth_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.preauthorization_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preauth_id uuid NOT NULL REFERENCES public.pre_authorizations(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.preauthorization_versions(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  submission_channel text NOT NULL DEFAULT 'email',
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','submitted','delivery_pending','delivered','failed','cancelled')),
  recipient_manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
  attachment_manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text,
  message_body text,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  delivered_at timestamptz,
  failure_reason text,
  external_reference text,
  UNIQUE(preauth_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.preauthorization_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preauth_id uuid NOT NULL REFERENCES public.pre_authorizations(id) ON DELETE CASCADE,
  submission_id uuid REFERENCES public.preauthorization_submissions(id) ON DELETE SET NULL,
  response_status text NOT NULL CHECK (response_status IN ('pending','approved','partially_approved','declined','more_information','expired','cancelled')),
  authorization_number text,
  authorized_amount numeric(14,2),
  response_date timestamptz NOT NULL DEFAULT now(),
  valid_until date,
  notes text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.preauthorization_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preauth_id uuid NOT NULL REFERENCES public.pre_authorizations(id) ON DELETE CASCADE,
  version_id uuid REFERENCES public.preauthorization_versions(id) ON DELETE SET NULL,
  submission_id uuid REFERENCES public.preauthorization_submissions(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_preauth_versions_preauth ON public.preauthorization_versions(preauth_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_preauth_submissions_preauth ON public.preauthorization_submissions(preauth_id, prepared_at DESC);
CREATE INDEX IF NOT EXISTS idx_preauth_responses_preauth ON public.preauthorization_responses(preauth_id, response_date DESC);
CREATE INDEX IF NOT EXISTS idx_preauth_audit_preauth ON public.preauthorization_audit_events(preauth_id, occurred_at DESC);

ALTER TABLE public.preauthorization_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preauthorization_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preauthorization_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preauthorization_audit_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.preauthorization_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.preauthorization_submissions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.preauthorization_responses TO authenticated;
GRANT SELECT, INSERT ON public.preauthorization_audit_events TO authenticated;
GRANT ALL ON public.preauthorization_versions, public.preauthorization_submissions, public.preauthorization_responses, public.preauthorization_audit_events TO service_role;

DROP POLICY IF EXISTS "Authenticated manage preauth versions" ON public.preauthorization_versions;
CREATE POLICY "Authenticated manage preauth versions" ON public.preauthorization_versions
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated create preauth versions" ON public.preauthorization_versions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated manage preauth submissions" ON public.preauthorization_submissions;
CREATE POLICY "Authenticated manage preauth submissions" ON public.preauthorization_submissions
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated manage preauth responses" ON public.preauthorization_responses;
CREATE POLICY "Authenticated manage preauth responses" ON public.preauthorization_responses
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated manage preauth audit" ON public.preauthorization_audit_events;
CREATE POLICY "Authenticated manage preauth audit" ON public.preauthorization_audit_events
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated create preauth audit" ON public.preauthorization_audit_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- Revision rows are append-only. Updates/deletes are intentionally denied to authenticated users.
REVOKE UPDATE, DELETE ON public.preauthorization_versions FROM authenticated;

-- Keep the parent record aligned with the lifecycle state for existing dashboards.
CREATE OR REPLACE FUNCTION public.sync_preauthorization_submission_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('submitted','delivery_pending','delivered') THEN
    UPDATE public.pre_authorizations
    SET status = 'submitted', current_state = 'Submitted', document_finalized_at = COALESCE(document_finalized_at, NEW.prepared_at)
    WHERE id = NEW.preauth_id;
  ELSIF NEW.status = 'failed' THEN
    UPDATE public.pre_authorizations
    SET current_state = 'Submission failed'
    WHERE id = NEW.preauth_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_preauth_submission_state ON public.preauthorization_submissions;
CREATE TRIGGER trg_sync_preauth_submission_state
AFTER INSERT OR UPDATE OF status ON public.preauthorization_submissions
FOR EACH ROW EXECUTE FUNCTION public.sync_preauthorization_submission_state();
