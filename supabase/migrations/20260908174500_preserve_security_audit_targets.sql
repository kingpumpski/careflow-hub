-- Security audit history must retain the identity of a deleted target account.
-- The audit log is historical evidence, so it must not null out target_user_id
-- when the referenced auth account is removed.

ALTER TABLE public.security_audit_log
  DROP CONSTRAINT IF EXISTS security_audit_log_target_user_id_fkey;

COMMENT ON COLUMN public.security_audit_log.target_user_id IS
  'Historical target auth user UUID. Intentionally not a foreign key so audit history survives account deletion.';
