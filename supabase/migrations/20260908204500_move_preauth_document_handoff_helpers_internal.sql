-- Privileged document/handoff helpers remain outside the exposed public schema.
-- Public wrappers are SECURITY INVOKER and perform no authorization themselves.
-- The internal functions enforce authentication, permission, and facility scope.

-- This migration intentionally contains only grants/comments because the helper
-- implementations are defined by the preceding migration. It exists to keep
-- the security boundary explicit in version control and future migrations.
comment on function security_internal.register_preauth_document(uuid,integer,jsonb,text,uuid) is 'Registers an immutable authorization-request PDF artifact against one frozen preauthorization revision; does not submit externally.';
comment on function security_internal.prepare_preauth_handoff(uuid,text,text,jsonb,text,text,text) is 'Creates an idempotent authorization-request email handoff package; never sends, submits, or records insurer delivery.';
