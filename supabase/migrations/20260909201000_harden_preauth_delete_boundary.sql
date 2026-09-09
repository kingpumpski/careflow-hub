-- Prevent destructive client-side deletion of pre-authorization records.
-- Pre-authorizations are workflow records with audit/history dependencies.
-- Existing workflow transition RPCs remain the supported lifecycle mutation path.

REVOKE DELETE ON public.pre_authorizations FROM authenticated;
REVOKE DELETE ON public.pre_authorizations FROM anon;
REVOKE DELETE ON public.pre_authorizations FROM public;

REVOKE DELETE ON public.preauth_items FROM authenticated;
REVOKE DELETE ON public.preauth_items FROM anon;
REVOKE DELETE ON public.preauth_items FROM public;

REVOKE DELETE ON public.preauth_email_log FROM authenticated;
REVOKE DELETE ON public.preauth_email_log FROM anon;
REVOKE DELETE ON public.preauth_email_log FROM public;
