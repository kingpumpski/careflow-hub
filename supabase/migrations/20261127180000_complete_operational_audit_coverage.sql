-- Complete operational audit coverage and security-event notifications.
-- Forward-only and additive: existing audit history and facility rows are preserved.
-- Audit snapshots redact direct identifiers and clinical/message content before storage.

CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_new jsonb;
  v_old jsonb;
  v_record_id text;
  v_redact_keys text[] := ARRAY[]::text[];
  v_actor uuid := (select auth.uid());
BEGIN
  IF TG_OP <> 'DELETE' THEN
    v_new := to_jsonb(NEW);
  END IF;
  IF TG_OP <> 'INSERT' THEN
    v_old := to_jsonb(OLD);
  END IF;

  v_record_id := coalesce(
    v_new->>'id',
    v_old->>'id',
    v_new->>'permission_key',
    v_old->>'permission_key',
    CASE WHEN TG_TABLE_NAME = 'role_permissions' THEN
      concat_ws(':', coalesce(v_new->>'role', v_old->>'role'),
                     coalesce(v_new->>'permission_key', v_old->>'permission_key'))
    END,
    CASE WHEN TG_TABLE_NAME = 'user_permission_overrides' THEN
      concat_ws(':', coalesce(v_new->>'user_id', v_old->>'user_id'),
                     coalesce(v_new->>'permission_key', v_old->>'permission_key'))
    END
  );

  -- Keep routing/ownership keys but do not duplicate clinical, identity,
  -- communication or configuration payloads into the broadly used audit log.
  v_redact_keys := CASE TG_TABLE_NAME
    WHEN 'patients' THEN ARRAY['patient_name','phone','membership_number']
    WHEN 'profiles' THEN ARRAY['full_name','email','phone']
    WHEN 'claims' THEN ARRAY['patient_name']
    WHEN 'claim_cases' THEN ARRAY['claim_number','patient_name','member_number','diagnosis','clinical_notes','denial_reason']
    WHEN 'claim_diagnosis_drafts' THEN ARRAY['patient_name','claim_number','rejection_reason','clinical_notes','authorization_code','comments','service_items','diagnoses','response_message']
    WHEN 'claim_case_events' THEN ARRAY['note','metadata']
    WHEN 'settlement_exception_audit_events' THEN ARRAY['reason','metadata']
    WHEN 'settlement_exceptions' THEN ARRAY['description']
    WHEN 'preauth_document_registry' THEN ARRAY['snapshot','snapshot_hash']
    WHEN 'preauth_versions' THEN ARRAY['snapshot','edited_by_name','pdf_url']
    WHEN 'preauthorization_versions' THEN ARRAY['snapshot','fingerprint']
    WHEN 'preauth_insurer_tariffs' THEN ARRAY['notes']
    WHEN 'preauth_items' THEN ARRAY['item_name']
    WHEN 'pre_authorizations' THEN ARRAY['patient_id','diagnosis','clinical_notes','approval_notes','custom_diagnoses','document_payload']
    WHEN 'preauth_client_suggestions' THEN ARRAY['normalized_name','client_name','date_of_birth','phone','email','address','identifier','membership_number']
    WHEN 'preauth_email_log' THEN ARRAY['to_email','cc_emails','subject','provider_response','error_message']
    WHEN 'preauth_handoff_log' THEN ARRAY['recipients','subject','message_body','attachment_name']
    WHEN 'chat_messages' THEN ARRAY['subject','body']
    WHEN 'system_settings' THEN ARRAY['value']
    WHEN 'insurance_companies' THEN ARRAY['email','phone','contact_person','additional_emails']
    WHEN 'client_companies' THEN ARRAY['contact_person','email','phone']
    WHEN 'doctors' THEN ARRAY['doctor_name','contact']
    ELSE ARRAY[]::text[]
  END;

  IF v_new IS NOT NULL THEN
    v_new := v_new - v_redact_keys;
  END IF;
  IF v_old IS NOT NULL THEN
    v_old := v_old - v_redact_keys;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, new_data, changed_by)
    VALUES (TG_TABLE_NAME, v_record_id, 'insert', v_new, v_actor);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, v_record_id, 'update', v_old, v_new, v_actor);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, changed_by)
    VALUES (TG_TABLE_NAME, v_record_id, 'delete', v_old, v_actor);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.audit_trigger_fn() FROM PUBLIC, anon, authenticated;

-- Install the canonical audit trigger on operational and administration tables.
-- Internal history/event tables are audited too; notification fan-out below
-- suppresses duplicate messages for rows generated as implementation details.
DO $audit_coverage$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'claims', 'payments', 'withholding_tax', 'insurance_companies',
    'client_companies', 'doctors', 'procedures', 'patients',
    'pre_authorizations', 'preauth_items', 'preauth_catalog_items',
    'preauth_client_suggestions', 'preauth_document_registry',
    'preauth_email_log', 'preauth_handoff_log', 'preauth_insurer_tariffs',
    'preauth_submissions', 'preauth_versions', 'preauthorization_versions',
    'preauthorization_submissions', 'procedure_templates', 'diagnosis_codes',
    'ledger_entries', 'claims_settlement_periods', 'claims_settlement_remittances',
    'claims_settlement_receipt_months', 'settlement_exceptions',
    'settlement_exception_audit_events', 'claim_cases', 'claim_case_events',
    'claim_diagnosis_drafts', 'facilities', 'facility_memberships',
    'profiles', 'system_settings', 'user_roles', 'user_permission_overrides',
    'app_permissions', 'role_permissions', 'chat_messages'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1
        FROM pg_catalog.pg_trigger t
       WHERE t.tgrelid = to_regclass(format('public.%I', v_table))
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
$audit_coverage$;

-- Expand notification routing to include composite-key administration tables,
-- facility membership changes, chat recipients and the full prepared-document flow.
CREATE OR REPLACE FUNCTION security_internal.notify_from_audit_log()
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
  v_role_text text;
BEGIN
  IF NEW.table_name IN (
    'notifications', 'audit_logs', 'preauth_versions',
    'preauthorization_versions', 'claim_case_events',
    'settlement_exception_audit_events', 'preauth_email_log'
  ) THEN
    RETURN NEW;
  END IF;

  v_facility_text := coalesce(
    v_payload->>'facility_id',
    NEW.new_data->>'facility_id',
    NEW.old_data->>'facility_id',
    CASE WHEN NEW.table_name = 'facilities' THEN NEW.record_id END
  );
  IF v_facility_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_facility_id := v_facility_text::uuid;
  END IF;

  -- Pre-authorization child records inherit facility scope from their parent.
  IF v_facility_id IS NULL
     AND v_payload->>'preauth_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND NEW.table_name IN (
       'preauth_items', 'preauth_submissions', 'preauth_email_log',
       'preauth_handoff_log', 'preauth_versions', 'preauthorization_versions'
     ) THEN
    SELECT p.facility_id INTO v_facility_id
      FROM public.pre_authorizations p
     WHERE p.id = (v_payload->>'preauth_id')::uuid;
  END IF;

  v_target_text := coalesce(
    v_payload->>'user_id',
    v_payload->>'created_by',
    v_payload->>'assigned_to',
    v_payload->>'owner_id',
    v_payload->>'approved_by',
    v_payload->>'recipient_id',
    v_payload->>'prepared_by',
    v_payload->>'submitted_by',
    v_payload->>'edited_by',
    CASE WHEN NEW.table_name = 'profiles' THEN NEW.record_id END
  );
  IF v_target_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_target_user_id := v_target_text::uuid;
  END IF;
  v_role_text := coalesce(v_payload->>'role', NEW.new_data->>'role', NEW.old_data->>'role');

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
    WHEN 'claims_settlement_receipt_months' THEN 'Settlement receipt month'
    WHEN 'settlement_exceptions' THEN 'Settlement exception'
    WHEN 'claim_cases' THEN 'Claim case'
    WHEN 'pre_authorizations' THEN 'Pre-authorization'
    WHEN 'preauthorization_submissions' THEN 'Prepared pre-authorization document'
    WHEN 'preauth_handoff_log' THEN 'Prepared document handoff'
    WHEN 'preauth_document_registry' THEN 'Prepared document'
    WHEN 'claim_diagnosis_drafts' THEN 'Claim diagnosis draft'
    WHEN 'patients' THEN 'Patient record'
    WHEN 'insurance_companies' THEN 'Insurance company'
    WHEN 'client_companies' THEN 'Client company'
    WHEN 'doctors' THEN 'Doctor record'
    WHEN 'procedures' THEN 'Procedure'
    WHEN 'ledger_entries' THEN 'Ledger entry'
    WHEN 'facilities' THEN 'Facility'
    WHEN 'facility_memberships' THEN 'Facility membership'
    WHEN 'user_roles' THEN 'User access role'
    WHEN 'user_permission_overrides' THEN 'User permission'
    WHEN 'app_permissions' THEN 'Permission catalogue entry'
    WHEN 'role_permissions' THEN 'Role permission'
    WHEN 'profiles' THEN 'User profile'
    WHEN 'chat_messages' THEN 'Chat message'
    WHEN 'system_settings' THEN 'System setting'
    ELSE initcap(replace(NEW.table_name, '_', ' '))
  END;

  v_action_label := CASE
    WHEN NEW.action ILIKE '%insert%' OR NEW.action ILIKE '%create%' THEN 'created'
    WHEN NEW.action ILIKE '%delete%' OR NEW.action ILIKE '%remove%' THEN 'removed'
    WHEN NEW.action ILIKE '%suspend%' THEN 'suspended'
    WHEN NEW.action ILIKE '%reverse%' THEN 'reversed'
    ELSE 'updated'
  END;

  v_category := CASE
    WHEN NEW.table_name IN (
      'claims', 'claim_cases', 'settlement_exceptions', 'pre_authorizations',
      'preauthorization_submissions', 'preauth_handoff_log', 'claim_diagnosis_drafts'
    ) THEN 'claims'
    WHEN NEW.table_name IN (
      'payments', 'withholding_tax', 'claims_settlement_periods',
      'claims_settlement_remittances', 'claims_settlement_receipt_months', 'ledger_entries'
    ) THEN 'finance'
    WHEN NEW.table_name = 'chat_messages' THEN 'communication'
    WHEN NEW.table_name IN (
      'facilities', 'facility_memberships', 'system_settings', 'user_roles',
      'user_permission_overrides', 'app_permissions', 'role_permissions', 'profiles'
    ) THEN 'administration'
    ELSE 'activity'
  END;

  v_action_url := CASE
    WHEN NEW.table_name IN ('claims', 'claim_cases') THEN '/claims'
    WHEN NEW.table_name IN (
      'payments', 'claims_settlement_periods', 'claims_settlement_remittances',
      'claims_settlement_receipt_months', 'settlement_exceptions'
    ) THEN '/claims/settlements'
    WHEN NEW.table_name = 'withholding_tax' THEN '/withholding-tax'
    WHEN NEW.table_name IN (
      'pre_authorizations', 'preauthorization_submissions',
      'preauth_items', 'preauth_document_registry', 'preauth_handoff_log'
    ) THEN '/pre-auth'
    WHEN NEW.table_name = 'claim_diagnosis_drafts' THEN '/claims/diagnosis-assistant'
    WHEN NEW.table_name IN ('patients', 'doctors', 'client_companies') THEN '/clients'
    WHEN NEW.table_name = 'insurance_companies' THEN '/insurance'
    WHEN NEW.table_name = 'ledger_entries' THEN '/ledger'
    WHEN NEW.table_name IN ('facilities', 'facility_memberships') THEN '/facilities'
    WHEN NEW.table_name IN ('user_roles', 'user_permission_overrides', 'app_permissions', 'role_permissions') THEN '/users'
    WHEN NEW.table_name = 'profiles' THEN '/profile'
    WHEN NEW.table_name = 'chat_messages' THEN '/chat'
    WHEN NEW.table_name = 'system_settings' THEN '/settings'
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
    SELECT ur.user_id
      FROM public.user_roles ur
     WHERE v_facility_id IS NULL
       AND (
         (NEW.table_name IN (
           'claims', 'claim_cases', 'settlement_exceptions', 'pre_authorizations',
           'preauthorization_submissions', 'preauth_handoff_log',
           'claim_diagnosis_drafts', 'patients', 'preauth_items',
           'preauth_document_registry'
         ) AND ur.role::text = ANY(ARRAY['superuser','admin','claims_officer','auditor']))
         OR
         (NEW.table_name IN (
           'payments', 'withholding_tax', 'claims_settlement_periods',
           'claims_settlement_remittances', 'claims_settlement_receipt_months', 'ledger_entries'
         ) AND ur.role::text = ANY(ARRAY['superuser','admin','accounts_officer','auditor']))
         OR
         (NEW.table_name IN (
           'insurance_companies', 'client_companies', 'doctors', 'procedures',
           'diagnosis_codes', 'preauth_catalog_items', 'preauth_insurer_tariffs',
           'procedure_templates'
         ) AND ur.role::text = ANY(ARRAY['superuser','admin','claims_officer','data_entry_officer']))
         OR
         (NEW.table_name IN (
           'system_settings', 'user_roles', 'user_permission_overrides',
           'app_permissions', 'profiles'
         ) AND ur.role::text = ANY(ARRAY['superuser','admin']))
         OR
         (NEW.table_name = 'role_permissions' AND ur.role::text = v_role_text)
       )
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
  JOIN auth.users u ON u.id = r.user_id
  WHERE r.user_id IS NOT NULL
  ON CONFLICT (user_id, source_audit_log_id)
    WHERE source_audit_log_id IS NOT NULL
  DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Security administration uses its separate append-only audit log. Notify the
-- affected account and the administrator without exposing metadata contents.
CREATE OR REPLACE FUNCTION security_internal.notify_from_security_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.notifications (
    user_id, title, message, read, created_at, category, entity_type,
    entity_id, actor_id, action_url, metadata, source_audit_log_id
  )
  SELECT
    recipient.user_id,
    'Account access activity',
    CASE
      WHEN recipient.user_id = NEW.target_user_id
        THEN 'An administrator recorded an access or account change affecting your account.'
      ELSE 'You recorded an administrative access or account change.'
    END,
    false,
    NEW.created_at,
    'administration',
    'security_audit_log',
    NEW.id::text,
    NEW.actor_user_id,
    CASE WHEN recipient.user_id = NEW.target_user_id THEN '/profile' ELSE '/audit-trail' END,
    jsonb_build_object('source_type', 'security_audit_log', 'action', NEW.action),
    NEW.id
  FROM (
    SELECT NEW.target_user_id AS user_id WHERE NEW.target_user_id IS NOT NULL
    UNION
    SELECT NEW.actor_user_id WHERE NEW.actor_user_id IS NOT NULL
  ) recipient
  JOIN auth.users u ON u.id = recipient.user_id
  ON CONFLICT (user_id, source_audit_log_id)
    WHERE source_audit_log_id IS NOT NULL
  DO NOTHING;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION security_internal.notify_from_audit_log() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION security_internal.notify_from_security_audit_log() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS security_audit_log_notify_insert ON public.security_audit_log;
CREATE TRIGGER security_audit_log_notify_insert
  AFTER INSERT ON public.security_audit_log
  FOR EACH ROW EXECUTE FUNCTION security_internal.notify_from_security_audit_log();

COMMENT ON FUNCTION public.audit_trigger_fn() IS
  'Append-only row audit trigger. Stores routing metadata and redacted snapshots; excludes direct identifiers and clinical/message payloads.';
COMMENT ON FUNCTION security_internal.notify_from_audit_log() IS
  'Routes operational audit events to affected active facility members, target users, role-based recipients and actors.';
COMMENT ON FUNCTION security_internal.notify_from_security_audit_log() IS
  'Routes security audit events to the affected account and administrative actor without exposing audit metadata.';
