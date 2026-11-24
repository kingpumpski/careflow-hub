-- Trigger functions execute through PostgreSQL trigger bindings, not client RPC.
-- Revoke explicit grants as well as the default PUBLIC grant.
REVOKE ALL ON FUNCTION public.audit_trigger_fn() FROM PUBLIC, anon, authenticated;
