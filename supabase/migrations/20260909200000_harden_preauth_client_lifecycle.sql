-- Harden pre-authorization lifecycle persistence at the database boundary.
-- Client applications must use the existing atomic lifecycle RPCs instead of
-- mutating lifecycle history/version rows directly.

REVOKE INSERT, UPDATE, DELETE ON public.preauth_versions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.preauth_versions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.preauth_versions FROM public;

-- Keep lifecycle history readable for authorized application users. The
-- transition RPC remains the sole writer and executes with controlled
-- server-side permissions.
