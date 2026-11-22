# Migration version reconciliation

## Current verified source-tree finding

The main branch at audit commit `f79f807382f1af8a65007983f89a9f82942214f5` contains 117 SQL migration files and three duplicate 14-digit version prefixes:

| Version | Files |
|---|---|
| `20260907140000` | `preauth_atomic_hardening.sql`; `preauth_versions_workflow_hardening.sql` |
| `20260907144000` | `preauth_document_integrity.sql`; `preauth_document_lifecycle.sql` |
| `20260907145000` | `preauth_audit_events.sql`; `preauth_workflow_transitions.sql` |

Supabase migration versions are the migration ledger's identity. Two files with the same version cannot be treated as two independently ordered migrations in a clean replay. The two document migrations also define overlapping document table/function names with different column and argument contracts, so this is not safe to resolve by choosing a filename arbitrarily.

## Guardrail added

`npm run verify:migrations` validates the timestamped filename convention, rejects any new/unapproved duplicate version, and allows only the three exact legacy collision groups listed above. CI runs this check before TypeScript, lint, tests and build. The allow-list is temporary technical debt, not a declaration that the migration history is production-safe.

## Required reconciliation before production deployment

1. Obtain a verified, restorable backup of the target Supabase project (database schema and data, Storage objects, Auth/user configuration and relevant project configuration). Record the backup time and target project ref.
2. Read the production `supabase_migrations.schema_migrations` ledger and compare it with all 116 repository filenames. Do not infer deployment state from Git alone.
3. For each duplicate version, determine whether neither, one, or both SQL files were applied, and inspect the actual resulting schema/functions. Specifically reconcile `preauthorization_versions` versus `pre_authorization_versions`, and the two `preauth_documents` definitions and `register_preauth_document` signatures.
4. Have a database reviewer produce an explicit mapping from each historical migration file to the production ledger state. Preserve already-applied migration identities; do not rename or edit a migration that production has recorded as applied.
5. If a duplicate migration has not been applied anywhere, select a unique version only after its dependency order is established. If one or both versions have been applied, use a forward-only corrective migration (or a controlled Supabase migration repair procedure backed by the ledger and backup) rather than rewriting history.
6. Test the reconciled sequence against a disposable database from an empty schema and, separately, against a restored copy of the production backup. Verify table definitions, function signatures, RLS policies, grants and indexes.
7. Remove the corresponding allow-list entry only after the source files and production ledger are reconciled and a clean replay passes.

## Production deployment boundary

The repository's deployment workflow must not be treated as proof that migrations are applied. The project reference in `supabase/config.toml` is `jajfdgknctzqypdtvmxo`; verify that this is the intended production project before enabling deployment. The deployment documentation also calls the project "claims tracker", so confirm project identity with the owner.

Until backup, ledger comparison, clean replay and restored-backup testing are complete, keep production database deployment blocked. Do not run `supabase db push --linked` as a workaround for duplicate versions.


## Latest read-only ledger inventory — 2026-11-22

See [Production migration ledger snapshot](MIGRATION_LEDGER_SNAPSHOT_2026-11-22.md) for all 74 live ledger rows and the 117-file repository inventory. A conservative normalized-name comparison found 56 direct matches, 61 repository files without a direct ledger-name match, and 18 ledger rows without a direct repository filename match. These are candidates for manual reconciliation, not definitive applied/unapplied classifications. No production migration or ledger repair was performed.


## Candidate source crosswalk — 2026-11-22

The following mappings were found by comparing the live ledger names with migration filenames and reviewing the candidate source files. They are **recovery leads only**. A similar purpose or name does not prove byte-for-byte or semantic equivalence, nor does it prove that the candidate SQL was the SQL originally applied in production.

| Live ledger name | Candidate repository migration | Assessment | Required proof before reconciliation |
|---|---|---|---|
| `20260907132501_preauth_complete_fingerprint_name_compat` | `20260907132500_preauth_atomic_dedup_boundary.sql` | Possible related pre-authorization fingerprint migration; version and name differ | Compare function definitions, constraints, indexes, and the production schema effects |
| `20260908120001_seed_role_permissions` | `20260908120000_user_access_management.sql` | Candidate contains permission tables/seeds; the ledger entry may have represented a separate seed-only step | Compare exact role/permission rows and the migration's original SQL |
| `harden_preauth_document_handoff_idempotency` | `20260908203500_preauth_document_handoff_integrity.sql` | Strong purpose match | Compare unique constraints, idempotency keys, RPC signatures, and trigger behavior |
| `add_missing_preauth_foreign_key_indexes` | `20260909100000_index_claims_settlement_period_foreign_keys.sql` | Strong purpose match | Compare every index name, key order, predicate, and validity in `pg_index` |
| `harden_masterdata_rls_permissions_v2` | `20260909080000_harden_masterdata_rls_permissions.sql` | Strong purpose match | Compare policies, role grants, helper calls, and policy expressions |
| `restore_preauth_rls_helper_execution` | `20260910140000_restore_security_helper_execution.sql` | Candidate execution-grant restoration | Compare exact function signatures and effective EXECUTE grants for each role |
| `relax_insurer_read_policy_for_operational_readers` | `20260911135000_align_insurer_read_access.sql` | Possible policy-alignment match | Compare policy expressions and role behavior; do not infer equivalence from the name |
| `remove_redundant_insurer_select_policy` | `20260909081000_remove_duplicate_insurance_select_policy.sql` | Strong purpose match | Compare policy names and expressions before/after, including permissive-policy OR behavior |
| `fix_facility_policy_recursion_runtime` | `20260921161000_fix_facility_rls_runtime_recursion.sql` | Strong purpose match | Compare recursive policy paths, helper definitions, and effective access for member/non-member users |

The remaining unmatched ledger entries still have no sufficiently verified one-to-one source mapping:

- `20260908183000_harden_security_function_execution`
- `20260908183500_lock_internal_security_definer_rpcs`
- `20260908183600_harden_compat_fingerprint_search_path`
- `database_performance_hardening`
- `restore_tariff_rls`
- `refine_tariff_access`
- `restore_preauth_rpc_execute_grants`
- `fix_preauth_document_hash_schema`
- `expose_preauth_transition_rpc_safely`

Do not mark any candidate as recovered, applied, or equivalent until the original SQL is recovered from a backup, deployment artifact, old repository clone, or other authoritative source and compared with the live catalog. The migration ledger records names, not SQL bodies. Where the original SQL cannot be recovered, use the live catalog to design a reviewed forward-only reconciliation migration after backup and restored-copy testing. Never replay a candidate merely to make the ledger names line up.

This crosswalk does not authorize migration repair, `supabase db push`, production DDL, or ledger edits.
