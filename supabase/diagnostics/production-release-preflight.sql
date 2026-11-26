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
    ('facility_memberships')
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
    ('transition_claim_case')
),
required_permissions(permission_key) AS (
  VALUES
    ('claims.settlement.read'),
    ('claims.settlement.write')
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
permission_checks AS (
  SELECT
    'permission: ' || p.permission_key AS check_name,
    'present in public.app_permissions'::text AS expected,
    CASE WHEN EXISTS (
      SELECT 1 FROM public.app_permissions a
      WHERE a.permission_key = p.permission_key
    ) THEN 'present' ELSE 'missing' END AS observed
  FROM required_permissions p
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
  UNION ALL SELECT * FROM permission_checks
  UNION ALL SELECT * FROM ledger_check
) checks
ORDER BY
  CASE
    WHEN observed = expected THEN 2
    WHEN observed LIKE 'present%' THEN 1
    ELSE 0
  END,
  check_name;
