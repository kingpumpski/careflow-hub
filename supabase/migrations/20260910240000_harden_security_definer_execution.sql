-- Security-definer helpers are database-internal authorization primitives.
-- Keep them callable by RLS/trigger execution, but do not expose them as client RPCs.

revoke all on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- The authorization helper is intentionally client-callable because the application
-- uses it for server-authoritative permission checks. Anonymous callers remain blocked.
revoke all on function public.current_user_has_permission(text) from public, anon;
grant execute on function public.current_user_has_permission(text) to authenticated;
