-- Contract checks for complete operational audit and security-event notification coverage.
DO $test$
DECLARE
  v_audit regprocedure := 'public.audit_trigger_fn()'::regprocedure;
  v_notify regprocedure := 'security_internal.notify_from_audit_log()'::regprocedure;
  v_security_notify regprocedure := 'security_internal.notify_from_security_audit_log()'::regprocedure;
  v_audit_definition text;
  v_notify_definition text;
  v_security_definition text;
  v_table text;
  v_required text[] := ARRAY[
    'facility_memberships', 'profiles', 'chat_messages',
    'app_permissions', 'role_permissions', 'user_permission_overrides'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_required LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_trigger t
       WHERE t.tgrelid = to_regclass(format('public.%I', v_table))
         AND t.tgname = 'careflow_audit_' || v_table
         AND NOT t.tgisinternal
         AND t.tgfoid = v_audit
    ) THEN
      RAISE EXCEPTION 'Operational audit trigger is missing for public.%', v_table;
    END IF;
  END LOOP;

  IF has_function_privilege('anon', v_audit, 'EXECUTE')
     OR has_function_privilege('authenticated', v_audit, 'EXECUTE') THEN
    RAISE EXCEPTION 'Audit trigger function must not be callable as a client RPC';
  END IF;

  v_audit_definition := pg_get_functiondef(v_audit);
  IF position('SET search_path TO ''''' in v_audit_definition) = 0
     OR position('clinical_notes' in v_audit_definition) = 0
     OR position('membership_number' in v_audit_definition) = 0
     OR position('message_body' in v_audit_definition) = 0
     OR position('permission_key' in v_audit_definition) = 0 THEN
    RAISE EXCEPTION 'Audit function must use a fixed search path, redact sensitive fields and support composite keys';
  END IF;

  v_notify_definition := pg_get_functiondef(v_notify);
  IF position('facility_memberships' in v_notify_definition) = 0
     OR position('role_permissions' in v_notify_definition) = 0
     OR position('recipient_id' in v_notify_definition) = 0
     OR position('/chat' in v_notify_definition) = 0 THEN
    RAISE EXCEPTION 'Audit notifications must route membership, permission and chat events to affected users';
  END IF;

  IF has_function_privilege('anon', v_notify, 'EXECUTE')
     OR has_function_privilege('authenticated', v_notify, 'EXECUTE') THEN
    RAISE EXCEPTION 'Operational notification fan-out must not be exposed as a client RPC';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.security_audit_log'::regclass
      AND tgname = 'security_audit_log_notify_insert'
      AND NOT tgisinternal
      AND tgfoid = v_security_notify
  ) THEN
    RAISE EXCEPTION 'Security audit events must notify the affected account and actor';
  END IF;

  IF has_function_privilege('anon', v_security_notify, 'EXECUTE')
     OR has_function_privilege('authenticated', v_security_notify, 'EXECUTE') THEN
    RAISE EXCEPTION 'Security notification fan-out must remain private';
  END IF;

  v_security_definition := pg_get_functiondef(v_security_notify);
  IF position('NEW.target_user_id' in v_security_definition) = 0
     OR position('NEW.actor_user_id' in v_security_definition) = 0
     OR position('source_type' in v_security_definition) = 0 THEN
    RAISE EXCEPTION 'Security notifications must identify both affected account and administrative actor';
  END IF;
END;
$test$;
