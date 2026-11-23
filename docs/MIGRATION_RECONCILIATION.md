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
2. Read the production `supabase_migrations.schema_migrations` ledger and compare it with all 117 repository filenames. Do not infer deployment state from Git alone.
3. For each duplicate version, determine whether neither, one, or both SQL files were applied, and inspect the actual resulting schema/functions. Specifically reconcile `preauthorization_versions` versus `pre_authorization_versions`, and the two `preauth_documents` definitions and `register_preauth_document` signatures.
4. Have a database reviewer produce an explicit mapping from each historical migration file to the production ledger state. Preserve already-applied migration identities; do not rename or edit a migration that production has recorded as applied.
5. If a duplicate migration has not been applied anywhere, select a unique version only after its dependency order is established. If one or both versions have been applied, use a forward-only corrective migration (or a controlled Supabase migration repair procedure backed by the ledger and backup) rather than rewriting history.
6. Test the reconciled sequence against a disposable database from an empty schema and, separately, against a restored copy of the production backup. Verify table definitions, function signatures, RLS policies, grants and indexes.
7. Remove the corresponding allow-list entry only after the source files and production ledger are reconciled and a clean replay passes.

## Production deployment boundary

The repository's deployment workflow must not be treated as proof that migrations are applied. The project reference in `supabase/config.toml` is `jajfdgknctzqypdtvmxo`; verify that this is the intended production project before enabling deployment. The deployment documentation also calls the project "claims tracker", so confirm project identity with the owner.

Until backup, ledger comparison, clean replay and restored-backup testing are complete, keep production database deployment blocked. Do not run `supabase db push --linked` as a workaround for duplicate versions.


## Latest read-only ledger inventory — 2026-11-23

The [2026-11-22 production migration ledger snapshot](MIGRATION_LEDGER_SNAPSHOT_2026-11-22.md) retains the complete 74-row ledger capture from the prior audit. A fresh read-only inventory on 2026-11-23 verified that the main branch at `f79f807382f1af8a65007983f89a9f82942214f5` contains 117 SQL migration files, while the live production ledger still contains 74 rows. The same conservative normalized-name comparison found 56 direct matches, 61 repository files without a direct ledger-name match, and 18 ledger rows without a direct repository filename match. The three duplicate timestamp-prefix groups listed above remain present. These are filename-level reconciliation candidates, not definitive applied/unapplied classifications. No production migration, schema, data, or ledger repair was performed.


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


## Read-only refresh — 2026-11-23

- Production project `jajfdgknctzqypdtvmxo` remains `ACTIVE_HEALTHY` on PostgreSQL 17.11 in `eu-west-1`.
- The live migration ledger still contains 74 rows; the repository main branch contains 117 timestamped SQL migration files.
- Normalized filename comparison: 56 direct matches, 61 unmatched local filenames, 18 unmatched remote ledger names.
- The nine candidate crosswalks above remain unverified recovery leads. The migration ledger stores names, not SQL bodies; no candidate was marked applied, unapplied, recovered, or semantically equivalent.
- Three duplicate source timestamp groups remain: `20260907140000`, `20260907144000`, and `20260907145000`.
- Supabase reports no database branches. No production DDL, migration replay/repair, ledger edits, data changes, or Auth configuration changes were performed.

This refresh does not authorize `supabase db push`, migration repair, or any production database mutation. The verified encrypted backup and restored-copy test remain prerequisites.


## Clean-replay finding — 2026-11-23

A disposable Supabase stack was started from the PR #79 source tree. Startup replay stopped at `20260907111500_preauth_deduplication_and_request_identity.sql` before reaching any PR #79 migration. The function `public.find_duplicate_preauthorization` declares its second returned column as `BIGINT`, but the preceding `20260907095500_preauthorization_studio.sql` adds `pre_authorizations.request_number` as `TEXT`. PostgreSQL rejected the function definition with SQLSTATE `42P13` (final statement returns text instead of bigint at column 2).

A separate read-only check of production on 2026-11-23 confirmed:

- `public.pre_authorizations.request_number` is `TEXT`.
- `public.find_duplicate_preauthorization(uuid,uuid,uuid,uuid,date,text,jsonb,uuid)` currently returns a table whose `request_number` field is `TEXT`.
- The production migration ledger contains the 20260907 pre-authorization migration entries, including `20260907111500_preauth_deduplication_and_request_identity` and later text-first/security-hardening migrations.

This is concrete evidence that the current repository migration source does not replay to the same intermediate state as production. It may reflect historical source drift or an earlier applied SQL variant. The migration ledger stores names rather than SQL bodies, so the original applied SQL has not yet been recovered. Do not edit the already-recorded migration, mark it unapplied, or alter production to make local replay pass. Recover the authoritative migration artifact or inspect a verified backup/deployment source, then reconcile the entire pre-authorization migration sequence and its duplicate timestamp groups. The disposable replay gate remains a release blocker until the canonical source sequence can be replayed without compatibility shims.

The local test workflow itself initially used the obsolete Supabase container exclusion name `inbucket`; this was corrected to `mailpit` in the PR branch. The SQL replay failure above remains unresolved and is not hidden or skipped.

No production DDL, data writes, migration repair, or ledger edits were performed.

### Repository history evidence — 2026-11-23

The source chronology has now been independently checked against GitHub's file history and the exact migration contents:

- Commit `347f46a20f92a68ab15fd7040540c967a03ed52f` (2026-09-07 09:58 UTC) introduced `20260907095500_preauthorization_studio.sql`. That migration adds `pre_authorizations.request_number` as `TEXT` and populates it with human-readable identifiers such as `PA-YYYY-XXXXXXXX`.
- Commit `05d4f7771cf1eddc9fbf94c9b869fe448d357003` (2026-09-07 11:17 UTC) introduced `20260907111500_preauth_deduplication_and_request_identity.sql`. It uses `ADD COLUMN IF NOT EXISTS request_number BIGINT` and declares the duplicate-lookup function's returned `request_number` as `BIGINT`. Because the earlier migration already created the column as `TEXT`, the later `ADD COLUMN IF NOT EXISTS` does not change its type; the function's declared return type therefore conflicts with the selected column on a clean replay.
- `20260907123000_preauth_text_first_identity.sql` repeats the `BIGINT` return declaration, so it does not resolve the clean-replay conflict.
- Later source migrations introduce a separate text-first RPC and eventually harden the legacy lookup to return `TEXT` (including `20260908200000_harden_preauth_security_definers.sql`). This is consistent with the live production catalog, but it does not make the earlier source sequence replayable from an empty database.

This confirms an intrinsic inconsistency in the checked-in historical migration sequence; it does **not** prove which SQL variant was applied to production. The production ledger contains migration version names, not SQL bodies. The repository history establishes when the current source versions were committed, not that these exact bytes were applied to the production project. Therefore no historical migration was edited and no migration-ledger repair was attempted. The next safe recovery step is to compare a verified production backup or deployment artifact with the live catalog and recover the SQL variant that was actually applied. Until that evidence exists, the disposable replay gate must remain failing and release merges remain blocked.

## Claims reconciliation source-of-truth review — 2026-11-23

The clarified operational requirement is that staff enter one aggregate submitted-claims amount per insurer and claims month/year from the approved claims system, then transcribe the insurer's approved amount, rejected amount, actual WHT and net cash from the later payment advice. CareFlow is the reconciliation register, not a replacement for the approved claims system.

A source review of PR #79 identified a material gap against that requirement:

- `claims_settlement_periods` is explicitly documented as the period-level external-source register, and it stores `total_claims_submitted`, but the current `claims_outstanding_periods` view builds `submitted_amount` and `rejected_amount` only from individual rows in `public.claims`.
- The view's settlement-period CTEs currently contribute settlement cash and WHT, but do not contribute `total_claims_submitted` or `rejection_amount` to the reported period totals.
- Consequently, an insurer/month entered only in the period-level register can appear with payment/WHT data while its submitted amount and rejection amount remain zero in this view. This does not meet the clarified primary workflow.
- The settlement table also does not currently store the approved gross amount as a separately transcribed insurer-advice value. The UI derives it as submitted less rejection. The desired workflow should capture the approved amount stated on the advice and compare it with submitted less rejected, flagging a mismatch rather than silently assuming equality.

Required follow-up before release: make the insurer-period register the authoritative source for aggregate submission and advice values in the monthly reconciliation report; add an explicit approved-amount field with database constraints/validation; preserve multiple receipt/advice events or a controlled amendment/audit history where insurers remit in parts; and add SQL integration tests proving that a period entered without any individual CareFlow claim rows still reconciles correctly. Do not merge this PR until those changes and the disposable migration replay blocker are resolved.

No production changes were made during this review.


### Exact production function-chain inspection — 2026-11-23 (read-only)

A further catalog inspection retrieved both production function definitions, not only the public signature:

- `public.find_duplicate_preauthorization(...)` is a SQL wrapper returning `request_number TEXT`; it delegates to `security_internal.find_duplicate_preauthorization(...)`.
- `security_internal.find_duplicate_preauthorization(...)` is a SECURITY DEFINER SQL function, also returning `request_number TEXT`. Its current body selects `pa.request_number` from `public.pre_authorizations` and retains the 30-day/non-rejected duplicate rule.
- The underlying `public.pre_authorizations.request_number` column is `TEXT`.

This confirms the live production catalog is internally consistent at the current endpoint: table column, internal implementation return type, and public wrapper return type are all TEXT. It does not recover the SQL body that was originally executed for the historical ledger entry `20260908181603 / 20260907111500_preauth_deduplication_and_request_identity`. The ledger records the migration name only, and the current catalog reflects all later migrations/changes. It is therefore not valid to infer that the checked-in BIGINT migration was the applied production body.

**Next safe recovery action:** obtain the verified production backup or deployment artifact and compare its schema/function dump with this live catalog and the Git history. If the exact original body is unavailable, document the gap and design a forward-only baseline/reconciliation path against a restored copy; do not use the current catalog as a reason to patch the old migration or skip it in the replay workflow.

No production data or schema was changed by this inspection.
