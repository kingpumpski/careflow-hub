-- Facility WHT-rate administration and notification delivery hardening.
-- This migration is additive and does not modify existing facility rows.

-- The private rate mutation helper must not be directly callable by clients.
-- The public SECURITY DEFINER wrapper below is the only authenticated entry point.
CREATE OR REPLACE FUNCTION public.set_facility_provisional_wht_rate(
  p_facility_id uuid,
  p_rate numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '42501';
  END IF;
  IF NOT security_internal.current_user_has_any_role(ARRAY['superuser'::public.app_role]) THEN
    RAISE EXCEPTION 'Only a superuser can configure facility WHT rates' USING ERRCODE = '42501';
  END IF;
  RETURN security_internal.set_facility_provisional_wht_rate(p_facility_id, p_rate);
END;
$function$;

REVOKE ALL ON FUNCTION security_internal.set_facility_provisional_wht_rate(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_facility_provisional_wht_rate(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_facility_provisional_wht_rate(uuid, numeric) TO authenticated;

COMMENT ON FUNCTION public.set_facility_provisional_wht_rate(uuid, numeric)
  IS 'Superuser-only facility provisional WHT rate configuration. Actual WHT remains sourced from insurer payment advice.';

-- Extend the existing recipient-owned notification table. Legacy notifications
-- remain readable; these nullable metadata columns are populated by audit events.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'activity',
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id text,
  ADD COLUMN IF NOT EXISTS facility_id uuid,
  ADD COLUMN IF NOT EXISTS actor_id uuid,
  ADD COLUMN IF NOT EXISTS action_url text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_audit_log_id uuid;

CREATE INDEX IF NOT EXISTS notifications_recipient_unread_created_idx
  ON public.notifications (user_id, read, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_audit_event_unique
  ON public.notifications (user_id, source_audit_log_id)
  WHERE source_audit_log_id IS NOT NULL;

-- The notification trigger deliberately stores only safe event metadata, not
-- source row JSON, patient data, claim values, or other potentially sensitive data.
CREATE OR REPLACE FUNCTION public.notify_from_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_payload jsonb := coalesce(NEW.new_data, NEW.old_data, '{}'::jsonb);
  v_facility_text text;
  v_facility_id uuid;
  v_target_text text;
  v_target_user_id uuid;
  v_actor_name text;
  v_entity_label text;
  v_action_label text;
  v_category text;
  v_action_url text;
BEGIN
  IF NEW.table_name IN ('notifications', 'audit_logs') THEN
    RETURN NEW;
  END IF;

  v_facility_text := coalesce(
    v_payload->>'facility_id',
    NEW.new_data->>'facility_id',
    NEW.old_data->>'facility_id',
    CASE
      WHEN NEW.table_name = 'facilities' THEN coalesce(NEW.record_id, v_payload->>'id')
    END
  );
  IF v_facility_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}
  v_target_text := coalesce(
    v_payload->>'user_id',
    v_payload->>'created_by',
    v_payload->>'assigned_to',
    v_payload->>'owner_id',
    v_payload->>'approved_by',
    v_payload->>'recipient_id'
  );
  IF v_target_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_target_user_id := v_target_text::uuid;
  END IF;

  SELECT nullif(trim(p.full_name), '')
    INTO v_actor_name
    FROM public.profiles p
   WHERE p.id = NEW.changed_by;
  v_actor_name := coalesce(v_actor_name, 'A CareFlow user');

  v_entity_label := CASE NEW.table_name
    WHEN 'claims' THEN 'Claim'
    WHEN 'payments' THEN 'Payment'
    WHEN 'withholding_tax' THEN 'Withholding-tax record'
    WHEN 'claims_settlement_periods' THEN 'Settlement period'
    WHEN 'claims_settlement_remittances' THEN 'Settlement remittance'
    WHEN 'settlement_exceptions' THEN 'Settlement exception'
    WHEN 'claim_cases' THEN 'Claim case'
    WHEN 'pre_authorizations' THEN 'Pre-authorization'
    WHEN 'preauthorization_submissions' THEN 'Prepared pre-authorization document'
    WHEN 'patients' THEN 'Patient record'
    WHEN 'insurance_companies' THEN 'Insurance company'
    WHEN 'client_companies' THEN 'Client company'
    WHEN 'doctors' THEN 'Doctor record'
    WHEN 'procedures' THEN 'Procedure'
    WHEN 'ledger_entries' THEN 'Ledger entry'
    WHEN 'facilities' THEN 'Facility'
    WHEN 'facility_memberships' THEN 'Facility membership'
    WHEN 'system_settings' THEN 'System setting'
    WHEN 'user_roles' THEN 'User access role'
    WHEN 'user_permission_overrides' THEN 'User permission'
    ELSE replace(initcap(replace(NEW.table_name, '_', ' ')), ' ', ' ')
  END;

  v_action_label := CASE
    WHEN NEW.action ILIKE '%insert%' OR NEW.action ILIKE '%create%' THEN 'created'
    WHEN NEW.action ILIKE '%delete%' OR NEW.action ILIKE '%remove%' THEN 'removed'
    WHEN NEW.action ILIKE '%suspend%' THEN 'suspended'
    WHEN NEW.action ILIKE '%reverse%' THEN 'reversed'
    ELSE 'updated'
  END;

  v_category := CASE
    WHEN NEW.table_name IN ('claims', 'claim_cases', 'settlement_exceptions', 'pre_authorizations', 'preauthorization_submissions') THEN 'claims'
    WHEN NEW.table_name IN ('payments', 'withholding_tax', 'claims_settlement_periods', 'claims_settlement_remittances', 'ledger_entries') THEN 'finance'
    WHEN NEW.table_name IN ('facilities', 'facility_memberships', 'system_settings') THEN 'administration'
    ELSE 'activity'
  END;

  v_action_url := CASE
    WHEN NEW.table_name IN ('claims', 'claim_cases') THEN '/claims'
    WHEN NEW.table_name IN ('payments', 'claims_settlement_periods', 'claims_settlement_remittances', 'settlement_exceptions') THEN '/claims/settlements'
    WHEN NEW.table_name = 'withholding_tax' THEN '/withholding-tax'
    WHEN NEW.table_name IN ('pre_authorizations', 'preauthorization_submissions') THEN '/pre-auth'
    WHEN NEW.table_name = 'claim_diagnosis_drafts' THEN '/claims/diagnosis-assistant'
    WHEN NEW.table_name IN ('patients', 'doctors', 'procedures', 'client_companies') THEN '/clients'
    WHEN NEW.table_name = 'insurance_companies' THEN '/insurance'
    WHEN NEW.table_name = 'ledger_entries' THEN '/ledger'
    WHEN NEW.table_name = 'facilities' THEN '/facilities'
    WHEN NEW.table_name = 'facility_memberships' THEN '/notifications'
    WHEN NEW.table_name = 'system_settings' THEN '/settings'
    WHEN NEW.table_name IN ('user_roles', 'user_permission_overrides') THEN '/notifications'
    ELSE '/audit-trail'
  END;

  WITH recipients AS (
    SELECT fm.user_id
      FROM public.facility_memberships fm
     WHERE v_facility_id IS NOT NULL
       AND fm.facility_id = v_facility_id
       AND fm.status = 'active'
       AND NEW.table_name <> 'facility_memberships'
    UNION
    SELECT v_target_user_id WHERE v_target_user_id IS NOT NULL
    UNION
    SELECT NEW.changed_by WHERE NEW.changed_by IS NOT NULL
  )
  INSERT INTO public.notifications (
    user_id, title, message, read, created_at, category, entity_type,
    entity_id, facility_id, actor_id, action_url, metadata, source_audit_log_id
  )
  SELECT
    r.user_id,
    v_entity_label || ' ' || initcap(v_action_label),
    v_entity_label || ' was ' || v_action_label || ' by ' || v_actor_name || '.',
    false,
    coalesce(NEW.changed_at, now()),
    v_category,
    NEW.table_name,
    NEW.record_id,
    v_facility_id,
    NEW.changed_by,
    v_action_url,
    jsonb_build_object('audit_action', NEW.action, 'audit_log_id', NEW.id),
    NEW.id
  FROM recipients r
  WHERE r.user_id IS NOT NULL
  ON CONFLICT (user_id, source_audit_log_id)
    WHERE source_audit_log_id IS NOT NULL
  DO NOTHING;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_from_audit_log() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS notify_from_audit_log_insert ON public.audit_logs;
CREATE TRIGGER notify_from_audit_log_insert
  AFTER INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.notify_from_audit_log();

-- Expand automatic audit coverage to existing business tables that have a
-- stable id column. Existing audit triggers are retained; missing ones are added.
DO $migration$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'claims', 'payments', 'withholding_tax', 'insurance_companies',
    'client_companies', 'doctors', 'procedures', 'patients',
    'pre_authorizations', 'preauth_items', 'ledger_entries',
    'claims_settlement_periods', 'claims_settlement_remittances',
    'claims_settlement_receipt_months', 'settlement_exceptions',
    'settlement_exception_audit_events', 'claim_cases', 'claim_case_events',
    'preauthorization_submissions', 'preauth_document_registry',
    'claim_diagnosis_drafts', 'system_settings', 'user_roles', 'user_permission_overrides'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = v_table AND column_name = 'id'
    ) THEN
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1
        FROM pg_catalog.pg_trigger t
        JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = v_table
         AND NOT t.tgisinternal
         AND t.tgfoid = 'public.audit_trigger_fn()'::regprocedure
    ) THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn()',
      'careflow_audit_' || v_table,
      v_table
    );
  END LOOP;
END;
$migration$;

COMMENT ON FUNCTION public.notify_from_audit_log() IS
  'Creates recipient-scoped in-app notifications from immutable audit events without copying sensitive source-row data.';
 THEN
    v_facility_id := v_facility_text::uuid;
  END IF;
  IF v_facility_id IS NULL AND NEW.table_name = 'preauth_items'
     AND v_payload->>'preauth_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}
  v_target_text := coalesce(
    v_payload->>'user_id',
    v_payload->>'created_by',
    v_payload->>'assigned_to',
    v_payload->>'owner_id',
    v_payload->>'approved_by'
  );
  IF v_target_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_target_user_id := v_target_text::uuid;
  END IF;

  SELECT nullif(trim(p.full_name), '')
    INTO v_actor_name
    FROM public.profiles p
   WHERE p.id = NEW.changed_by;
  v_actor_name := coalesce(v_actor_name, 'A CareFlow user');

  v_entity_label := CASE NEW.table_name
    WHEN 'claims' THEN 'Claim'
    WHEN 'payments' THEN 'Payment'
    WHEN 'withholding_tax' THEN 'Withholding-tax record'
    WHEN 'claims_settlement_periods' THEN 'Settlement period'
    WHEN 'claims_settlement_remittances' THEN 'Settlement remittance'
    WHEN 'settlement_exceptions' THEN 'Settlement exception'
    WHEN 'claim_cases' THEN 'Claim case'
    WHEN 'pre_authorizations' THEN 'Pre-authorization'
    WHEN 'preauthorization_submissions' THEN 'Prepared pre-authorization document'
    WHEN 'patients' THEN 'Patient record'
    WHEN 'insurance_companies' THEN 'Insurance company'
    WHEN 'client_companies' THEN 'Client company'
    WHEN 'doctors' THEN 'Doctor record'
    WHEN 'procedures' THEN 'Procedure'
    WHEN 'ledger_entries' THEN 'Ledger entry'
    WHEN 'facilities' THEN 'Facility'
    WHEN 'facility_memberships' THEN 'Facility membership'
    WHEN 'system_settings' THEN 'System setting'
    ELSE replace(initcap(replace(NEW.table_name, '_', ' ')), ' ', ' ')
  END;

  v_action_label := CASE
    WHEN NEW.action ILIKE '%insert%' OR NEW.action ILIKE '%create%' THEN 'created'
    WHEN NEW.action ILIKE '%delete%' OR NEW.action ILIKE '%remove%' THEN 'removed'
    WHEN NEW.action ILIKE '%suspend%' THEN 'suspended'
    WHEN NEW.action ILIKE '%reverse%' THEN 'reversed'
    ELSE 'updated'
  END;

  v_category := CASE
    WHEN NEW.table_name IN ('claims', 'claim_cases', 'settlement_exceptions', 'pre_authorizations', 'preauthorization_submissions') THEN 'claims'
    WHEN NEW.table_name IN ('payments', 'withholding_tax', 'claims_settlement_periods', 'claims_settlement_remittances', 'ledger_entries') THEN 'finance'
    WHEN NEW.table_name IN ('facilities', 'facility_memberships', 'system_settings') THEN 'administration'
    ELSE 'activity'
  END;

  v_action_url := CASE
    WHEN NEW.table_name IN ('claims', 'claim_cases') THEN '/claims'
    WHEN NEW.table_name IN ('payments', 'claims_settlement_periods', 'claims_settlement_remittances', 'settlement_exceptions') THEN '/claims/settlements'
    WHEN NEW.table_name = 'withholding_tax' THEN '/withholding-tax'
    WHEN NEW.table_name IN ('pre_authorizations', 'preauthorization_submissions') THEN '/pre-auth'
    WHEN NEW.table_name = 'claim_diagnosis_drafts' THEN '/claims/diagnosis-assistant'
    WHEN NEW.table_name IN ('patients', 'doctors', 'procedures', 'client_companies') THEN '/clients'
    WHEN NEW.table_name = 'insurance_companies' THEN '/insurance'
    WHEN NEW.table_name = 'ledger_entries' THEN '/ledger'
    WHEN NEW.table_name IN ('facilities', 'facility_memberships') THEN '/facilities'
    WHEN NEW.table_name = 'system_settings' THEN '/settings'
    ELSE '/audit-trail'
  END;

  WITH recipients AS (
    SELECT fm.user_id
      FROM public.facility_memberships fm
     WHERE v_facility_id IS NOT NULL
       AND fm.facility_id = v_facility_id
       AND fm.status = 'active'
    UNION
    SELECT v_target_user_id WHERE v_target_user_id IS NOT NULL
    UNION
    SELECT NEW.changed_by WHERE NEW.changed_by IS NOT NULL
  )
  INSERT INTO public.notifications (
    user_id, title, message, read, created_at, category, entity_type,
    entity_id, facility_id, actor_id, action_url, metadata, source_audit_log_id
  )
  SELECT
    r.user_id,
    v_entity_label || ' ' || initcap(v_action_label),
    v_entity_label || ' was ' || v_action_label || ' by ' || v_actor_name || '.',
    false,
    coalesce(NEW.changed_at, now()),
    v_category,
    NEW.table_name,
    NEW.record_id,
    v_facility_id,
    NEW.changed_by,
    v_action_url,
    jsonb_build_object('audit_action', NEW.action, 'audit_log_id', NEW.id),
    NEW.id
  FROM recipients r
  WHERE r.user_id IS NOT NULL
  ON CONFLICT (user_id, source_audit_log_id)
    WHERE source_audit_log_id IS NOT NULL
  DO NOTHING;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_from_audit_log() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS notify_from_audit_log_insert ON public.audit_logs;
CREATE TRIGGER notify_from_audit_log_insert
  AFTER INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.notify_from_audit_log();

-- Expand automatic audit coverage to existing business tables that have a
-- stable id column. Existing audit triggers are retained; missing ones are added.
DO $migration$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'claims', 'payments', 'withholding_tax', 'insurance_companies',
    'client_companies', 'doctors', 'procedures', 'patients',
    'pre_authorizations', 'preauth_items', 'ledger_entries',
    'claims_settlement_periods', 'claims_settlement_remittances',
    'claims_settlement_receipt_months', 'settlement_exceptions',
    'settlement_exception_audit_events', 'claim_cases', 'claim_case_events',
    'preauthorization_submissions', 'preauth_document_registry',
    'claim_diagnosis_drafts', 'system_settings'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = v_table AND column_name = 'id'
    ) THEN
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1
        FROM pg_catalog.pg_trigger t
        JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = v_table
         AND NOT t.tgisinternal
         AND t.tgfoid = 'public.audit_trigger_fn()'::regprocedure
    ) THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn()',
      'careflow_audit_' || v_table,
      v_table
    );
  END LOOP;
END;
$migration$;

COMMENT ON FUNCTION public.notify_from_audit_log() IS
  'Creates recipient-scoped in-app notifications from immutable audit events without copying sensitive source-row data.';
 THEN
    SELECT p.facility_id INTO v_facility_id
      FROM public.pre_authorizations p
     WHERE p.id = (v_payload->>'preauth_id')::uuid;
  END IF;

  v_target_text := coalesce(
    v_payload->>'user_id',
    v_payload->>'created_by',
    v_payload->>'assigned_to',
    v_payload->>'owner_id',
    v_payload->>'approved_by'
  );
  IF v_target_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_target_user_id := v_target_text::uuid;
  END IF;

  SELECT nullif(trim(p.full_name), '')
    INTO v_actor_name
    FROM public.profiles p
   WHERE p.id = NEW.changed_by;
  v_actor_name := coalesce(v_actor_name, 'A CareFlow user');

  v_entity_label := CASE NEW.table_name
    WHEN 'claims' THEN 'Claim'
    WHEN 'payments' THEN 'Payment'
    WHEN 'withholding_tax' THEN 'Withholding-tax record'
    WHEN 'claims_settlement_periods' THEN 'Settlement period'
    WHEN 'claims_settlement_remittances' THEN 'Settlement remittance'
    WHEN 'settlement_exceptions' THEN 'Settlement exception'
    WHEN 'claim_cases' THEN 'Claim case'
    WHEN 'pre_authorizations' THEN 'Pre-authorization'
    WHEN 'preauthorization_submissions' THEN 'Prepared pre-authorization document'
    WHEN 'patients' THEN 'Patient record'
    WHEN 'insurance_companies' THEN 'Insurance company'
    WHEN 'client_companies' THEN 'Client company'
    WHEN 'doctors' THEN 'Doctor record'
    WHEN 'procedures' THEN 'Procedure'
    WHEN 'ledger_entries' THEN 'Ledger entry'
    WHEN 'facilities' THEN 'Facility'
    WHEN 'facility_memberships' THEN 'Facility membership'
    WHEN 'system_settings' THEN 'System setting'
    ELSE replace(initcap(replace(NEW.table_name, '_', ' ')), ' ', ' ')
  END;

  v_action_label := CASE
    WHEN NEW.action ILIKE '%insert%' OR NEW.action ILIKE '%create%' THEN 'created'
    WHEN NEW.action ILIKE '%delete%' OR NEW.action ILIKE '%remove%' THEN 'removed'
    WHEN NEW.action ILIKE '%suspend%' THEN 'suspended'
    WHEN NEW.action ILIKE '%reverse%' THEN 'reversed'
    ELSE 'updated'
  END;

  v_category := CASE
    WHEN NEW.table_name IN ('claims', 'claim_cases', 'settlement_exceptions', 'pre_authorizations', 'preauthorization_submissions') THEN 'claims'
    WHEN NEW.table_name IN ('payments', 'withholding_tax', 'claims_settlement_periods', 'claims_settlement_remittances', 'ledger_entries') THEN 'finance'
    WHEN NEW.table_name IN ('facilities', 'facility_memberships', 'system_settings') THEN 'administration'
    ELSE 'activity'
  END;

  v_action_url := CASE
    WHEN NEW.table_name IN ('claims', 'claim_cases') THEN '/claims'
    WHEN NEW.table_name IN ('payments', 'claims_settlement_periods', 'claims_settlement_remittances', 'settlement_exceptions') THEN '/claims/settlements'
    WHEN NEW.table_name = 'withholding_tax' THEN '/withholding-tax'
    WHEN NEW.table_name IN ('pre_authorizations', 'preauthorization_submissions') THEN '/pre-auth'
    WHEN NEW.table_name = 'claim_diagnosis_drafts' THEN '/claims/diagnosis-assistant'
    WHEN NEW.table_name IN ('patients', 'doctors', 'procedures', 'client_companies') THEN '/clients'
    WHEN NEW.table_name = 'insurance_companies' THEN '/insurance'
    WHEN NEW.table_name = 'ledger_entries' THEN '/ledger'
    WHEN NEW.table_name IN ('facilities', 'facility_memberships') THEN '/facilities'
    WHEN NEW.table_name = 'system_settings' THEN '/settings'
    ELSE '/audit-trail'
  END;

  WITH recipients AS (
    SELECT fm.user_id
      FROM public.facility_memberships fm
     WHERE v_facility_id IS NOT NULL
       AND fm.facility_id = v_facility_id
       AND fm.status = 'active'
    UNION
    SELECT v_target_user_id WHERE v_target_user_id IS NOT NULL
    UNION
    SELECT NEW.changed_by WHERE NEW.changed_by IS NOT NULL
  )
  INSERT INTO public.notifications (
    user_id, title, message, read, created_at, category, entity_type,
    entity_id, facility_id, actor_id, action_url, metadata, source_audit_log_id
  )
  SELECT
    r.user_id,
    v_entity_label || ' ' || initcap(v_action_label),
    v_entity_label || ' was ' || v_action_label || ' by ' || v_actor_name || '.',
    false,
    coalesce(NEW.changed_at, now()),
    v_category,
    NEW.table_name,
    NEW.record_id,
    v_facility_id,
    NEW.changed_by,
    v_action_url,
    jsonb_build_object('audit_action', NEW.action, 'audit_log_id', NEW.id),
    NEW.id
  FROM recipients r
  WHERE r.user_id IS NOT NULL
  ON CONFLICT (user_id, source_audit_log_id)
    WHERE source_audit_log_id IS NOT NULL
  DO NOTHING;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_from_audit_log() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS notify_from_audit_log_insert ON public.audit_logs;
CREATE TRIGGER notify_from_audit_log_insert
  AFTER INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.notify_from_audit_log();

-- Expand automatic audit coverage to existing business tables that have a
-- stable id column. Existing audit triggers are retained; missing ones are added.
DO $migration$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'claims', 'payments', 'withholding_tax', 'insurance_companies',
    'client_companies', 'doctors', 'procedures', 'patients',
    'pre_authorizations', 'preauth_items', 'ledger_entries',
    'claims_settlement_periods', 'claims_settlement_remittances',
    'claims_settlement_receipt_months', 'settlement_exceptions',
    'settlement_exception_audit_events', 'claim_cases', 'claim_case_events',
    'preauthorization_submissions', 'preauth_document_registry',
    'claim_diagnosis_drafts', 'system_settings'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = v_table AND column_name = 'id'
    ) THEN
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1
        FROM pg_catalog.pg_trigger t
        JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = v_table
         AND NOT t.tgisinternal
         AND t.tgfoid = 'public.audit_trigger_fn()'::regprocedure
    ) THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn()',
      'careflow_audit_' || v_table,
      v_table
    );
  END LOOP;
END;
$migration$;

COMMENT ON FUNCTION public.notify_from_audit_log() IS
  'Creates recipient-scoped in-app notifications from immutable audit events without copying sensitive source-row data.';
