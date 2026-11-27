-- Contract checks for audit-driven in-app notification delivery.
DO $test$
DECLARE
  v_notify regprocedure := 'security_internal.notify_from_audit_log()'::regprocedure;
  v_definition text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.audit_logs'::regclass
      AND tgname = 'notify_from_audit_log_insert'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Audit log inserts must fan out to in-app notifications';
  END IF;

  IF has_function_privilege('anon', v_notify, 'EXECUTE')
     OR has_function_privilege('authenticated', v_notify, 'EXECUTE') THEN
    RAISE EXCEPTION 'Notification fan-out function must not be exposed as a client RPC';
  END IF;

  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_notify) THEN
    RAISE EXCEPTION 'Notification fan-out must be able to write through recipient-scoped RLS';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'action_url'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'source_audit_log_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'read_at'
  ) THEN
    RAISE EXCEPTION 'Notification routing, idempotency and read timestamps must be available';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications'
      AND policyname = 'notifications_update_own' AND cmd = 'UPDATE'
  ) THEN
    RAISE EXCEPTION 'Notification updates must remain restricted to the recipient';
  END IF;

  v_definition := pg_get_functiondef(v_notify);
  IF position('public.user_roles' in v_definition) = 0
     OR position('claims_officer' in v_definition) = 0
     OR position('accounts_officer' in v_definition) = 0 THEN
    RAISE EXCEPTION 'Global events without facility scope must notify the affected operational roles';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'notifications_recipient_unread_created_idx'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'notifications_user_audit_event_unique'
  ) THEN
    RAISE EXCEPTION 'Notification unread and idempotency indexes are required';
  END IF;
END;
$test$;
