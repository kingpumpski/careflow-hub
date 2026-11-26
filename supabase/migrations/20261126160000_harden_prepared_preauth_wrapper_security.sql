-- Keep the API wrapper invoker-scoped. Privileged work is performed only
-- inside the non-exposed security_internal implementation after its own checks.
CREATE OR REPLACE FUNCTION public.finalize_preauthorization_handoff(
  p_preauth_id uuid,p_snapshot jsonb,p_total_cost numeric,
  p_recipient_manifest jsonb,p_attachment_manifest jsonb,
  p_subject text,p_message_body text,p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT security_internal.finalize_preauthorization_handoff($1,$2,$3,$4,$5,$6,$7,$8);
$function$;

REVOKE ALL ON FUNCTION public.finalize_preauthorization_handoff(uuid,jsonb,numeric,jsonb,jsonb,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_preauthorization_handoff(uuid,jsonb,numeric,jsonb,jsonb,text,text,text) TO authenticated;

COMMENT ON FUNCTION public.finalize_preauthorization_handoff(uuid,jsonb,numeric,jsonb,jsonb,text,text,text)
IS 'Invoker-scoped API wrapper. Delegates to the permission-checked private finalizer that records a prepared email handoff only.';
