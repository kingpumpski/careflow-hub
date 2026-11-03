-- Keep audit history server-generated and prevent direct client forgery.
-- The trigger function is SECURITY DEFINER and therefore does not depend on the
-- caller's audit_logs INSERT policy. Explicitly revoke client INSERT/UPDATE/DELETE
-- privileges as defense in depth; SELECT remains governed by audit.read RLS.

revoke insert, update, delete on table public.audit_logs from anon, authenticated;
grant select on table public.audit_logs to authenticated;

-- The audit trigger only needs to write audit rows through its definer privileges.
-- Restrict function execution to the trigger mechanism rather than exposing it as
-- a callable RPC to clients.
revoke all on function public.audit_trigger_fn() from public;

-- Existing triggers invoke the function internally; no client execute grant is needed.
