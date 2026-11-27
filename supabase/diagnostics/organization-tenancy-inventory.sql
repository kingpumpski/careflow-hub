-- CareFlow Hub organization-tenancy catalogue inventory (READ ONLY).
-- Run against the explicitly confirmed Supabase project in the SQL editor.
-- This script reads PostgreSQL catalog metadata only. It does not read business
-- row contents, apply migrations, change data, or modify database objects.
--
-- Run all result sets and retain them with the migration crosswalk. The output
-- is a discovery aid, not proof that current RLS or application behavior is safe.

-- 1. Relations and likely ownership/scope columns.
SELECT
  n.nspname AS schema_name,
  c.relname AS relation_name,
  CASE c.relkind
    WHEN 'r' THEN 'table'
    WHEN 'p' THEN 'partitioned table'
    WHEN 'v' THEN 'view'
    WHEN 'm' THEN 'materialized view'
    WHEN 'f' THEN 'foreign table'
    ELSE c.relkind::text
  END AS relation_type,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  c.relpersistence AS persistence,
  string_agg(a.attname, ', ' ORDER BY a.attnum)
    FILTER (WHERE a.attname IN (
      'organization_id', 'tenant_id', 'facility_id', 'user_id',
      'created_by', 'owner_id', 'claim_id', 'payment_id'
    )) AS ownership_candidate_columns
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attribute a
  ON a.attrelid = c.oid
 AND a.attnum > 0
 AND NOT a.attisdropped
WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
  AND n.nspname NOT LIKE 'pg_temp_%'
  AND n.nspname NOT LIKE 'pg_toast_temp_%'
GROUP BY n.nspname, c.relname, c.relkind, c.relrowsecurity,
         c.relforcerowsecurity, c.relpersistence
ORDER BY n.nspname, c.relname;

-- 2. All foreign keys, including composite keys and delete/update behavior.
SELECT
  src_ns.nspname AS source_schema,
  src.relname AS source_table,
  con.conname AS constraint_name,
  string_agg(src_col.attname, ', ' ORDER BY src_key.ord) AS source_columns,
  dst_ns.nspname AS referenced_schema,
  dst.relname AS referenced_table,
  string_agg(dst_col.attname, ', ' ORDER BY dst_key.ord) AS referenced_columns,
  con.convalidated AS validated,
  con.condeferrable AS deferrable,
  con.condeferred AS initially_deferred,
  pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint con
JOIN pg_class src ON src.oid = con.conrelid
JOIN pg_namespace src_ns ON src_ns.oid = src.relnamespace
JOIN pg_class dst ON dst.oid = con.confrelid
JOIN pg_namespace dst_ns ON dst_ns.oid = dst.relnamespace
JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS src_key(attnum, ord) ON true
JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS dst_key(attnum, ord)
  ON dst_key.ord = src_key.ord
JOIN pg_attribute src_col
  ON src_col.attrelid = src.oid AND src_col.attnum = src_key.attnum
JOIN pg_attribute dst_col
  ON dst_col.attrelid = dst.oid AND dst_col.attnum = dst_key.attnum
WHERE con.contype = 'f'
  AND src_ns.nspname NOT IN ('pg_catalog', 'information_schema')
GROUP BY src_ns.nspname, src.relname, con.conname, dst_ns.nspname,
         dst.relname, con.convalidated, con.condeferrable,
         con.condeferred, con.oid
ORDER BY source_schema, source_table, constraint_name;

-- 3. RLS policies and their exact USING / WITH CHECK expressions.
SELECT
  schemaname AS schema_name,
  tablename AS relation_name,
  policyname AS policy_name,
  permissive,
  roles,
  cmd AS command,
  qual AS using_expression,
  with_check AS check_expression
FROM pg_policies
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY schemaname, tablename, policyname;

-- 4. Views and materialized views: definitions and security-invoker option.
SELECT
  n.nspname AS schema_name,
  c.relname AS view_name,
  CASE c.relkind WHEN 'm' THEN 'materialized view' ELSE 'view' END AS view_type,
  c.reloptions,
  pg_get_viewdef(c.oid, true) AS definition
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('v', 'm')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, c.relname;

-- 5. Application functions/RPCs: security mode, search_path and grants.
-- Function bodies are included for code review; inspect them for tenant checks,
-- client-controlled identifiers, dynamic SQL, and cross-tenant references.
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_function_result(p.oid) AS result_type,
  l.lanname AS language,
  p.prosecdef AS security_definer,
  p.proconfig AS function_settings,
  has_schema_privilege('anon', n.oid, 'USAGE') AS anon_schema_usage,
  has_schema_privilege('authenticated', n.oid, 'USAGE') AS authenticated_schema_usage,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND p.prokind IN ('f', 'p')
ORDER BY n.nspname, p.proname, identity_arguments;

-- 6. Non-internal triggers and their definitions.
SELECT
  n.nspname AS schema_name,
  c.relname AS relation_name,
  t.tgname AS trigger_name,
  t.tgenabled AS enabled_state,
  pg_get_triggerdef(t.oid, true) AS definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, c.relname, t.tgname;

-- 7. Relevant schema objects and migration ledger presence (no ledger rows read).
SELECT
  candidate.object_name,
  to_regclass(candidate.object_name) IS NOT NULL AS present
FROM (VALUES
  ('public.organizations'),
  ('public.organization_memberships'),
  ('public.module_catalog'),
  ('public.organization_module_entitlements'),
  ('public.organization_module_events'),
  ('public.facilities'),
  ('public.facility_memberships'),
  ('supabase_migrations.schema_migrations'),
  ('storage.buckets'),
  ('storage.objects')
) AS candidate(object_name)
ORDER BY candidate.object_name;
