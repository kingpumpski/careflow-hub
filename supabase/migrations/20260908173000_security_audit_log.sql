-- Append-only security audit trail for privileged account/access changes.
-- Administrative writes are performed by the hardened Edge Function using service-role credentials.

CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (length(trim(action)) BETWEEN 1 AND 100),
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_audit_log_created_at_idx
  ON public.security_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS security_audit_log_actor_idx
  ON public.security_audit_log (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS security_audit_log_target_idx
  ON public.security_audit_log (target_user_id, created_at DESC);

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Audit records are never writable through the client Data API.
REVOKE INSERT, UPDATE, DELETE ON public.security_audit_log FROM authenticated;
GRANT SELECT ON public.security_audit_log TO authenticated;

DROP POLICY IF EXISTS security_audit_log_select_privileged ON public.security_audit_log;
CREATE POLICY security_audit_log_select_privileged
  ON public.security_audit_log
  FOR SELECT
  TO authenticated
  USING (
    (select public.current_user_has_any_role(ARRAY['superuser', 'admin', 'auditor']::public.app_role[]))
    AND (select public.current_user_has_permission('audit.read'))
  );

COMMENT ON TABLE public.security_audit_log IS
  'Append-only audit trail for privileged administrative and access-control actions. Client writes are prohibited.';
