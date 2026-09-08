-- Preserve historical actor UUIDs when an administrative user account is deleted.
-- Audit history is immutable evidence and must not prevent legitimate account deletion.
-- actor_user_id intentionally remains a historical UUID without an FK to auth.users.

ALTER TABLE public.security_audit_log
  DROP CONSTRAINT IF EXISTS security_audit_log_actor_user_id_fkey;

COMMENT ON COLUMN public.security_audit_log.actor_user_id IS
  'Historical UUID of the user who performed the action; intentionally not an FK so audit history survives account deletion.';
