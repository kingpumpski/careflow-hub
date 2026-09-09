-- Lock down privileged pre-authorization helper wrappers.
-- These operations are internal/server orchestration primitives and are not
-- required by the browser client. Their SECURITY DEFINER implementations live
-- in security_internal and must not be directly reachable through the Data API.

REVOKE EXECUTE ON FUNCTION public.preauth_snapshot(uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.prepare_preauth_handoff(
  uuid, text, text, jsonb, text, text, text
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.register_preauth_document(
  uuid, integer, jsonb, text, uuid
) FROM PUBLIC, anon, authenticated;
