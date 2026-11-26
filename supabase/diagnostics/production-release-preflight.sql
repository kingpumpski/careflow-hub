-- CareFlow Hub production-release preflight (READ ONLY).
-- Run manually in the Supabase SQL editor against the explicitly confirmed project.
-- This script performs catalog lookups only. It does not apply migrations, alter data,
-- modify the migration ledger, or prove that historical migration SQL is equivalent.
-- Function checks are name-presence checks; reviewers must verify exact signatures,
-- SECURITY DEFINER settings, search_path, grants, and function bodies separately.

WITH
required_relations(relation_name) AS (
  VALUES
    ('settlement_exceptions'),
    ('settlement_exception_audit_events'),
    ('claims_settlement_remittances'),
    ('claims_settlement_receipt_months'),
    ('claim_cases'),
    ('claim_case_events'),
    ('claims_settlement_periods'),
    ('claims_outstanding_periods'),
    ('facilities'),
    ('facility_memberships'),
    -- Document-preparation core. The legacy preauth_submissions queue table is not the handoff source.
    ('pre_authorizations'),
    ('preauth_items'),
    ('preauthorization_versions'),
    ('preauthorization_submissions'),
    ('preauthorization_audit_events'),
    ('preauth_document_registry'),
    ('preauth_handoff_log'),
    ('preauth_email_log')
),
required_columns(table_name, column_name) AS (
  VALUES
    ('claims_settlement_periods', 'approved_gross_amount'),
    ('claims_settlement_periods', 'actual_receipt_date')
),
required_functions(function_name) AS (
  VALUES
    ('record_settlement_exception'),
    ('transition_settlement_exception_atomic'),
    ('record_claims_settlement_remittance'),
    ('get_report_letterhead_settings'),
    ('create_claim_case'),
    ('transition_claim_case'),
    ('finalize_preauthorization_handoff')
),
relation_checks AS (
  SELECT
    'relation: public.' || r.relation_name AS check_name,
    'present'::text AS expected,
    CASE WHEN to_regclass('public.' || quote_ident(r.relation_name)) IS NOT NULL
      THEN 'present' ELSE 'missing' END AS observed
  FROM required_relations r
),
column_checks AS (
  SELECT
    'column: public.' || c.table_name || '.' || c.column_name AS check_name,
    'present'::text AS expected,
    CASE WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns i
      WHERE i.table_schema = 'public'
        AND i.table_name = c.table_name
        AND i.column_name = c.column_name
    ) THEN 'present' ELSE 'missing' END AS observed
  FROM required_columns c
),
function_checks AS (
  SELECT
    'function name: public.' || f.function_name AS check_name,
    'present'::text AS expected,
    CASE WHEN EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = f.function_name
    ) THEN 'present (signature not verified)' ELSE 'missing' END AS observed
  FROM required_functions f
),
preauth_legacy_name_check AS (
  SELECT
    'pre-authorization legacy relation: public.pre_auth_submissions' AS check_name,
    'absent'::text AS expected,
    CASE WHEN to_regclass('public.pre_auth_submissions') IS NULL
      THEN 'absent' ELSE 'present (unexpected legacy relation)' END AS observed
),
preauth_finalizer_contract AS (
  SELECT
    'pre-authorization finalizer relation reference: security_internal.finalize_preauthorization_handoff' AS check_name,
    'canonical public.preauthorization_submissions only'::text AS expected,
    CASE
      WHEN p.oid IS NULL THEN 'missing private finalizer'
      WHEN position('public.pre_auth_submissions' in pg_get_functiondef(p.oid)) > 0
        THEN 'references misspelled public.pre_auth_submissions'
      WHEN position('public.preauth_submissions' in pg_get_functiondef(p.oid)) > 0
        THEN 'references legacy queue-shaped public.preauth_submissions'
      WHEN position('public.preauthorization_submissions' in pg_get_functiondef(p.oid)) > 0
        THEN 'canonical public.preauthorization_submissions only'
      ELSE 'canonical handoff relation reference not found'
    END AS observed
  FROM (SELECT 1) seed
  LEFT JOIN pg_proc p
    ON p.proname = 'finalize_preauthorization_handoff'
   AND p.pronamespace = 'security_internal'::regnamespace
   AND pg_get_function_identity_arguments(p.oid) =
       'p_preauth_id uuid, p_snapshot jsonb, p_total_cost numeric, p_recipient_manifest jsonb, p_attachment_manifest jsonb, p_subject text, p_message_body text, p_idempotency_key text'
),
preauth_finalizer_status_contract AS (
  SELECT
    'pre-authorization finalizer status semantics' AS check_name,
    'prepared handoff only; no queue status'::text AS expected,
    CASE
      WHEN p.oid IS NULL THEN 'missing private finalizer'
      WHEN position(chr(39) || 'queued' || chr(39) in pg_get_functiondef(p.oid)) > 0
        THEN 'contains legacy queued status'
      WHEN position(chr(39) || 'prepared' || chr(39) in pg_get_functiondef(p.oid)) > 0
        THEN 'prepared handoff only; no queue status'
      ELSE 'prepared status not found'
    END AS observed
  FROM (SELECT 1) seed
  LEFT JOIN pg_proc p
    ON p.proname = 'finalize_preauthorization_handoff'
   AND p.pronamespace = 'security_internal'::regnamespace
   AND pg_get_function_identity_arguments(p.oid) =
       'p_preauth_id uuid, p_snapshot jsonb, p_total_cost numeric, p_recipient_manifest jsonb, p_attachment_manifest jsonb, p_subject text, p_message_body text, p_idempotency_key text'
),
preauth_public_wrapper_security AS (
  SELECT
    'pre-authorization public finalizer wrapper security' AS check_name,
    'SECURITY DEFINER, empty search_path, authenticated execute, anon denied'::text AS expected,
    CASE
      WHEN p.oid IS NULL THEN 'missing public wrapper'
      WHEN p.prosecdef
       AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']::text[]
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
       AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
        THEN 'SECURITY DEFINER, empty search_path, authenticated execute, anon denied'
      ELSE 'security/grant contract mismatch'
    END AS observed
  FROM (SELECT 1) seed
  LEFT JOIN pg_proc p
    ON p.proname = 'finalize_preauthorization_handoff'
   AND p.pronamespace = 'public'::regnamespace
   AND pg_get_function_identity_arguments(p.oid) =
       'p_preauth_id uuid, p_snapshot jsonb, p_total_cost numeric, p_recipient_manifest jsonb, p_attachment_manifest jsonb, p_subject text, p_message_body text, p_idempotency_key text'
),
permission_schema_contract AS (
  SELECT
    'permission schema compatibility: public.app_permissions, role_permissions, user_permission_overrides' AS check_name,
    'supported legacy or canonical column contract'::text AS expected,
    CASE
      WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='app_permissions' AND column_name IN ('key','permission_key'))
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='role_permissions' AND column_name='permission_key')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_permission_overrides' AND column_name IN ('granted','allowed'))
        THEN 'supported legacy or canonical column contract'
      ELSE 'unsupported permission schema'
    END AS observed
),
permission_role_contract AS (
  SELECT
    'role permission: claims_officer claims.settlement.read' AS check_name,
    'present in catalogue and role grants'::text AS expected,
    CASE WHEN EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role::text='claims_officer' AND rp.permission_key='claims.settlement.read')
      AND EXISTS (SELECT 1 FROM public.app_permissions ap WHERE coalesce(to_jsonb(ap)->>'key',to_jsonb(ap)->>'permission_key')='claims.settlement.read')
      THEN 'present in catalogue and role grants' ELSE 'missing' END AS observed
  UNION ALL
  SELECT
    'role permission: claims_officer claims.settlement.write',
    'present in catalogue and role grants'::text,
    CASE WHEN EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role::text='claims_officer' AND rp.permission_key='claims.settlement.write')
      AND EXISTS (SELECT 1 FROM public.app_permissions ap WHERE coalesce(to_jsonb(ap)->>'key',to_jsonb(ap)->>'permission_key')='claims.settlement.write')
      THEN 'present in catalogue and role grants' ELSE 'missing' END
  UNION ALL
  SELECT
    'role permission: accounts_officer payments.read',
    'present in catalogue and role grants'::text,
    CASE WHEN EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role::text='accounts_officer' AND rp.permission_key='payments.read')
      AND EXISTS (SELECT 1 FROM public.app_permissions ap WHERE coalesce(to_jsonb(ap)->>'key',to_jsonb(ap)->>'permission_key')='payments.read')
      THEN 'present in catalogue and role grants' ELSE 'missing' END
  UNION ALL
  SELECT
    'role permission: accounts_officer payments.write',
    'present in catalogue and role grants'::text,
    CASE WHEN EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role::text='accounts_officer' AND rp.permission_key='payments.write')
      AND EXISTS (SELECT 1 FROM public.app_permissions ap WHERE coalesce(to_jsonb(ap)->>'key',to_jsonb(ap)->>'permission_key')='payments.write')
      THEN 'present in catalogue and role grants' ELSE 'missing' END
),
ledger_check AS (
  SELECT
    'migration ledger: supabase_migrations.schema_migrations' AS check_name,
    'present'::text AS expected,
    CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NOT NULL
      THEN 'present (rows not counted by this diagnostic)'
      ELSE 'missing'
    END AS observed
)
SELECT
  check_name,
  expected,
  observed,
  CASE
    WHEN observed = expected THEN 'PASS'
    WHEN observed LIKE 'present (signature%' OR observed LIKE 'present (rows%' THEN 'REVIEW'
    ELSE 'BLOCKED'
  END AS status
FROM (
  SELECT * FROM relation_checks
  UNION ALL SELECT * FROM column_checks
  UNION ALL SELECT * FROM function_checks
  UNION ALL SELECT * FROM permission_role_contract
  UNION ALL SELECT * FROM preauth_legacy_name_check
  UNION ALL SELECT * FROM preauth_finalizer_contract
  UNION ALL SELECT * FROM preauth_finalizer_status_contract
  UNION ALL SELECT * FROM preauth_public_wrapper_security
  UNION ALL SELECT * FROM permission_schema_contract
  UNION ALL SELECT * FROM ledger_check
) checks
ORDER BY
  CASE
    WHEN observed = expected THEN 2
    WHEN observed LIKE 'present%' THEN 1
    ELSE 0
  END,
  check_name;
