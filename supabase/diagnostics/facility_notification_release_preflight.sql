-- READ-ONLY release preflight for facility onboarding, notifications and audit coverage.
-- Safe to run against production: SELECTs only; no DDL, DML, grants or ledger changes.

WITH checks AS (
  SELECT
    'Migration ledger head' AS check_name,
    CASE WHEN (SELECT max(version) FROM supabase_migrations.schema_migrations) >= '20261127190000'
      THEN 'PASS' ELSE 'BLOCKED' END AS status,
    coalesce((SELECT version || ' / ' || name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 1), 'No migration rows') AS detail

  UNION ALL
  SELECT 'Facility base tables',
    CASE WHEN to_regclass('public.facilities') IS NOT NULL
           AND to_regclass('public.facility_memberships') IS NOT NULL
      THEN 'PASS' ELSE 'BLOCKED' END,
    'facilities=' || coalesce(to_regclass('public.facilities')::text, 'missing')
      || '; facility_memberships=' || coalesce(to_regclass('public.facility_memberships')::text, 'missing')

  UNION ALL
  SELECT 'Facility onboarding RPCs',
    CASE WHEN to_regprocedure('public.create_facility_with_owner(text,text,text,text,text,text)') IS NOT NULL
           AND to_regprocedure('public.add_facility_member_by_email(uuid,text,text)') IS NOT NULL
           AND to_regprocedure('public.deactivate_facility_member(uuid,text)') IS NOT NULL
           AND to_regprocedure('public.set_facility_provisional_wht_rate(uuid,numeric)') IS NOT NULL
      THEN 'PASS' ELSE 'BLOCKED' END,
    'create/add/suspend/WHT RPC signatures must all exist'

  UNION ALL
  SELECT 'Document letterhead RPC and role scope',
    CASE WHEN to_regprocedure('public.get_report_letterhead_settings()') IS NOT NULL
           AND to_regprocedure('security_internal.get_report_letterhead_settings()') IS NOT NULL
           AND position('reports.read' in pg_get_functiondef(to_regprocedure('security_internal.get_report_letterhead_settings()'))) > 0
           AND position('ledger.read' in pg_get_functiondef(to_regprocedure('security_internal.get_report_letterhead_settings()'))) > 0
           AND position('claims.read' in pg_get_functiondef(to_regprocedure('security_internal.get_report_letterhead_settings()'))) > 0
           AND position('preauth.read' in pg_get_functiondef(to_regprocedure('security_internal.get_report_letterhead_settings()'))) > 0
      THEN 'PASS' ELSE 'BLOCKED' END,
    'Reports, ledger, claims and pre-authorization readers must receive only approved branding fields'

  UNION ALL
  SELECT 'Notification schema',
    CASE WHEN (
      SELECT count(*) = 9
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'notifications'
        AND column_name = ANY(ARRAY[
          'category','entity_type','entity_id','facility_id','actor_id',
          'action_url','metadata','read_at','source_audit_log_id'
        ])
    ) THEN 'PASS' ELSE 'BLOCKED' END,
    'Expected 9 notification metadata columns: category, entity_type, entity_id, facility_id, actor_id, action_url, metadata, read_at, source_audit_log_id'

  UNION ALL
  SELECT 'Audit-to-notification trigger',
    CASE WHEN to_regprocedure('security_internal.notify_from_audit_log()') IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM pg_trigger
             WHERE tgrelid = 'public.audit_logs'::regclass
               AND tgname = 'notify_from_audit_log_insert'
               AND NOT tgisinternal
           )
      THEN 'PASS' ELSE 'BLOCKED' END,
    'Audit log inserts must create recipient notifications'

  UNION ALL
  SELECT 'Security-audit notification trigger',
    CASE WHEN to_regprocedure('security_internal.notify_from_security_audit_log()') IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM pg_trigger
             WHERE tgrelid = 'public.security_audit_log'::regclass
               AND tgname = 'security_audit_log_notify_insert'
               AND NOT tgisinternal
           )
      THEN 'PASS' ELSE 'BLOCKED' END,
    'Security events must notify affected account and administrative actor'

  UNION ALL
  SELECT 'Operational audit trigger coverage',
    CASE WHEN (
      SELECT count(*) = 6
      FROM pg_trigger t
      WHERE NOT t.tgisinternal
        AND t.tgfoid = to_regprocedure('public.audit_trigger_fn()')
        AND t.tgname = ANY(ARRAY[
          'careflow_audit_facility_memberships','careflow_audit_profiles',
          'careflow_audit_chat_messages','careflow_audit_app_permissions',
          'careflow_audit_role_permissions','careflow_audit_user_permission_overrides'
        ])
    ) THEN 'PASS' ELSE 'BLOCKED' END,
    'Facility membership, profile, chat and permission mutations must be audited'

  UNION ALL
  SELECT 'Notification recipient isolation',
    CASE WHEN (
      SELECT relrowsecurity FROM pg_class WHERE oid = 'public.notifications'::regclass
    ) AND EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'notifications'
        AND policyname = 'notifications_update_own'
        AND cmd = 'UPDATE'
        AND qual LIKE '%auth.uid%'
        AND with_check LIKE '%auth.uid%'
    ) THEN 'PASS' ELSE 'BLOCKED' END,
    'RLS and recipient-only UPDATE policy must be enabled'

  UNION ALL
  SELECT 'Audit log read protection',
    CASE WHEN (
      SELECT relrowsecurity FROM pg_class WHERE oid = 'public.audit_logs'::regclass
    ) AND EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'audit_logs'
        AND cmd = 'SELECT'
        AND qual LIKE '%audit.read%'
    ) THEN 'PASS' ELSE 'BLOCKED' END,
    'Audit log reads must remain permission-scoped'

  UNION ALL
  SELECT 'Claim diagnosis draft persistence',
    CASE WHEN to_regclass('public.claim_diagnosis_drafts') IS NOT NULL
      THEN 'PASS' ELSE 'BLOCKED' END,
    'The saved-draft relation must exist before draft persistence is enabled'

  UNION ALL
  SELECT 'Settlement and claim-case schema',
    CASE WHEN to_regclass('public.settlement_exceptions') IS NOT NULL
           AND to_regclass('public.claim_cases') IS NOT NULL
           AND to_regclass('public.claim_case_events') IS NOT NULL
           AND to_regclass('public.claims_settlement_remittances') IS NOT NULL
           AND to_regclass('public.claims_settlement_receipt_months') IS NOT NULL
      THEN 'PASS' ELSE 'BLOCKED' END,
    'Exception, case, remittance and receipt-month objects must be present'

  UNION ALL
  SELECT 'Settlement advice columns',
    CASE WHEN (
      SELECT count(*) = 2
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'claims_settlement_periods'
        AND column_name = ANY(ARRAY['approved_gross_amount','actual_receipt_date'])
    ) THEN 'PASS' ELSE 'BLOCKED' END,
    'approved_gross_amount and actual_receipt_date must both exist'

  UNION ALL
  SELECT 'Claims officer settlement permissions',
    CASE WHEN (
      SELECT count(DISTINCT ap.permission_key) = 2
      FROM public.app_permissions ap
      JOIN public.role_permissions rp ON rp.permission_key = ap.permission_key
      WHERE ap.permission_key = ANY(ARRAY['claims.settlement.read','claims.settlement.write'])
        AND rp.role = 'claims_officer'::public.app_role
    ) THEN 'PASS' ELSE 'BLOCKED' END,
    'claims_officer must have scoped claims.settlement.read and claims.settlement.write grants'

  UNION ALL
  SELECT 'Pre-authorization finalizer relation',
    CASE WHEN to_regprocedure('security_internal.finalize_preauthorization_handoff(uuid,jsonb,numeric,jsonb,jsonb,text,text,text)') IS NOT NULL
           AND position('public.pre_auth_submissions' in pg_get_functiondef(to_regprocedure('security_internal.finalize_preauthorization_handoff(uuid,jsonb,numeric,jsonb,jsonb,text,text,text)'))) = 0
           AND position('public.preauth_submissions' in pg_get_functiondef(to_regprocedure('security_internal.finalize_preauthorization_handoff(uuid,jsonb,numeric,jsonb,jsonb,text,text,text)'))) > 0
      THEN 'PASS' ELSE 'BLOCKED' END,
    'The private finalizer must reference canonical public.preauth_submissions, not the absent pre_auth_submissions'

  UNION ALL
  SELECT 'Facility test environment readiness',
    CASE WHEN to_regclass('public.facilities') IS NOT NULL
           AND to_regclass('public.facility_memberships') IS NOT NULL
           AND to_regprocedure('public.create_facility_with_owner(text,text,text,text,text,text)') IS NOT NULL
           AND to_regprocedure('public.add_facility_member_by_email(uuid,text,text)') IS NOT NULL
           AND to_regprocedure('public.deactivate_facility_member(uuid,text)') IS NOT NULL
           AND to_regprocedure('public.set_facility_provisional_wht_rate(uuid,numeric)') IS NOT NULL
      THEN 'PASS' ELSE 'BLOCKED' END,
    'No test facility is created by this diagnostic; it only checks prerequisites'

  UNION ALL
  SELECT 'Current facility inventory',
    'INFO',
    'facilities=' || (SELECT count(*)::text FROM public.facilities)
      || '; memberships=' || (SELECT count(*)::text FROM public.facility_memberships)
)
SELECT check_name, status, detail
FROM checks
ORDER BY CASE status WHEN 'BLOCKED' THEN 1 WHEN 'INFO' THEN 2 ELSE 3 END, check_name;
