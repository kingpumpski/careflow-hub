# Migration version reconciliation

## Current verified source-tree finding

The inventory below is a historical source-tree snapshot from audit commit `f79f807382f1af8a65007983f89a9f82942214f5` and is superseded by the dated refresh near the end of this document. At that time the tree contained 117 SQL migration files and three duplicate 14-digit version prefixes:

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
2. Read the production `supabase_migrations.schema_migrations` ledger and compare it with all repository migration filenames at the time of release. Do not infer deployment state from Git alone.
3. For each duplicate version, determine whether neither, one, or both SQL files were applied, and inspect the actual resulting schema/functions. Specifically reconcile `preauthorization_versions` versus `pre_authorization_versions`, and the two `preauth_documents` definitions and `register_preauth_document` signatures.
4. Have a database reviewer produce an explicit mapping from each historical migration file to the production ledger state. Preserve already-applied migration identities; do not rename or edit a migration that production has recorded as applied.
5. If a duplicate migration has not been applied anywhere, select a unique version only after its dependency order is established. If one or both versions have been applied, use a forward-only corrective migration (or a controlled Supabase migration repair procedure backed by the ledger and backup) rather than rewriting history.
6. Test the reconciled sequence against a disposable database from an empty schema and, separately, against a restored copy of the production backup. Verify table definitions, function signatures, RLS policies, grants and indexes.
7. Remove the corresponding allow-list entry only after the source files and production ledger are reconciled and a clean replay passes.

## Production deployment boundary

The repository's deployment workflow must not be treated as proof that migrations are applied. The project reference in `supabase/config.toml` is `jajfdgknctzqypdtvmxo`. The owner-confirmed project is named `claims tracker` and is `ACTIVE_HEALTHY` in `eu-west-1`. Project identity is no longer the open blocker; the backup/restore gate and semantic migration reconciliation remain open.

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


### Latest replay run and domain-validation update — 2026-11-23 14:53 UTC

The disposable PostgreSQL workflow on PR #79 commit `e1c73243f6bc70f8d4ef5e8fddd995533d1effbb` (run `45198825376`, job `137776453521`) successfully pulled the required Supabase images and started the local database. Migration replay then failed at `20260907111500_preauth_deduplication_and_request_identity.sql` with SQLSTATE `42P13`: `public.find_duplicate_preauthorization` declares its second output column as `BIGINT`, while the final SELECT returns `pa.request_number` as `TEXT`. The complete migration replay step and SQL behavioral tests were skipped after this failure. This confirms the blocker is the migration's return-type mismatch, not a container pull failure.

The same PR head's other checks completed successfully:
- CI run `45198825520`: success.
- CareFlow Quality Gate run `45198825518`: success.
- Dependency Security Audit run `45198825192`: success.
- Disposable PostgreSQL Migration Tests run `45198825376`: failure before settlement SQL tests.

Settlement-domain hardening added after the prior replay run:
- Advice-reference duplicate detection now trims whitespace and normalizes letter case before comparison, so references such as `ADV-1` and ` adv-1 ` cannot be counted twice by the pure reconciliation function.
- Advice and receipt date validation now verifies actual calendar dates (including month/day validity), rather than accepting any string with a `YYYY-MM-DD` shape.
- Unit tests cover case/whitespace duplicate references and impossible dates.

These changes do not alter the database schema or make the remittance workflow persistent. Explicit approved gross capture, separate actual receipt-date capture, immutable multi-remittance storage/RPC, and aggregate claims-month versus receipt-month reporting remain unimplemented. The PR remains draft and unmerged. No production DDL, data writes, migration-ledger repair, or Auth changes were performed.


## Remittance ledger and aggregate reporting changes — 2026-11-23

PR #79 now contains two additional forward migrations on the feature branch:

- `20261123153000_add_claims_settlement_remittance_ledger.sql`: creates the append-only advice/remittance child ledger, snapshots existing legacy advice without inventing approved gross, and exposes a facility/permission-scoped atomic RPC. Authenticated direct writes are revoked. New remittance entries are immutable.
- `20261123160000_match_aggregate_claims_periods_and_receipt_months.sql`: updates `claims_outstanding_periods` so a monthly aggregate settlement-period record is the authoritative submitted/rejected source when present, and adds a receipt-month view for net cash and actual WHT.

The Claims Settlement UI now records the insurer-stated approved gross amount, advice date and actual receipt date separately, calls the atomic RPC, supports additional advice entries against the same period, and displays event history. The Outstanding Claims page now includes receipt-month totals. These changes are branch-only and have not been applied to production.

The legacy snapshot intentionally leaves approved gross unknown where the prior table never captured it. A new explicit event does not retroactively prove the approved gross for a historical remittance. The event ledger currently has no compensating-reversal RPC; correcting an erroneous event safely is still an implementation requirement. Contract tests were added, but runtime SQL behavior is not certified until the disposable replay and database tests pass. The historical pre-authorization replay conflict remains a release blocker.


## Remittance reversal and receipt report correction — 2026-11-23

The branch now also includes `20261123170000_add_claims_settlement_remittance_reversals.sql` and `20261123173000_exclude_reversed_remittances_from_receipt_reporting.sql`. A permission-scoped compensating-reversal RPC requires a reason, references the original immutable remittance, permits only one reversal per event, refreshes parent totals atomically, and reopens a reconciled period for review. The UI exposes this correction action. Receipt-month cash/WHT excludes reversed events while preserving the audit trail.

These forward migrations remain branch-only. Their SQL contract tests have been extended, but they have not executed because the disposable Supabase startup/replay halts at the historical 20260907111500 pre-authorization function return-type mismatch.


## Expanded pre-authorization replay evidence — 2026-11-23 16:38 UTC

A further read-only review compared the repository migration chain with the live production catalog and migration ledger. This narrows the replay failure and identifies additional type-inconsistent statements; it does **not** authorize a historical migration rewrite or ledger repair.

### Repository chain findings

- `20260907095500_preauthorization_studio.sql` adds `public.pre_authorizations.request_number` as `TEXT`.
- `20260907111500_preauth_deduplication_and_request_identity.sql` declares `public.find_duplicate_preauthorization(...)` to return `request_number BIGINT`, while selecting `pa.request_number` from that TEXT column. This is the exact disposable replay failure (SQLSTATE `42P13`).
- `20260907123000_preauth_text_first_identity.sql` repeats the same BIGINT return declaration for the same TEXT column, so correcting only the first failing declaration would not establish a clean replay.
- `20260907124500_preauth_text_first_duplicate_guard.sql` declares `existing_request BIGINT` and selects the TEXT request number into it.
- `20260907132500_preauth_atomic_dedup_boundary.sql` declares `v_existing BIGINT` and selects the TEXT request number into it.
- Later repository migrations move the model back to TEXT: `20260907140000_preauth_atomic_hardening.sql` declares a text-first lookup result, and `20260908200000_harden_preauth_security_definers.sql` defines both the internal lookup and public wrapper with `request_number TEXT`.

### Live production evidence (read-only)

- `public.pre_authorizations.request_number` is TEXT.
- `public.find_duplicate_preauthorization(...)` returns `request_number TEXT` and is a SECURITY INVOKER wrapper.
- `security_internal.find_duplicate_preauthorization(...)` returns `request_number TEXT` and is SECURITY DEFINER.
- The live function definitions are consistent with the TEXT column.
- The live migration ledger contains 74 rows and records the relevant pre-authorization migrations, including `20260907111500_preauth_deduplication_and_request_identity`, `20260907124500_preauth_text_first_duplicate_guard`, `20260907132500_preauth_atomic_dedup_boundary`, `20260907133000_preauth_atomic_and_client_suggestions`, `20260907140000_preauth_versions_workflow_hardening`, and `harden_preauth_security_definers`.

### Interpretation and next safe step

The final production catalog and later migration definitions agree on TEXT, but the checked-in historical chain contains earlier BIGINT declarations and additional BIGINT local variables. The production migration ledger stores version/name records, not the original SQL body or its checksum. The 18 unmatched ledger entries in the snapshot also show that the current repository inventory is not a complete, direct representation of every deployed migration artifact.

Therefore, the evidence proves the repository's current fresh-replay chain is internally inconsistent; it does not prove which exact historical SQL body was applied in production. Do not patch only the first failure, alter the production catalog, mark migrations applied, or rewrite historical files on this evidence alone. Recover the deployed SQL bundle/source commit or a verified database backup first. Then reconstruct a complete ordered replay chain, reconcile all BIGINT/TEXT transitions (including the later declarations above), and run the entire disposable replay and SQL behavioral suite before release.


## Pre-authorization request-number type repair — 2026-11-23

At the user's explicit direction, PR #79 now aligns the known inconsistent historical source declarations with the established TEXT schema:

- `20260907111500_preauth_deduplication_and_request_identity.sql`: its fallback `ADD COLUMN IF NOT EXISTS request_number` declaration and duplicate-lookup return column now both use TEXT.
- `20260907123000_preauth_text_first_identity.sql`: duplicate-lookup return column now uses TEXT.
- `20260907124500_preauth_text_first_duplicate_guard.sql`: `existing_request` local variable now uses TEXT.
- `20260907132500_preauth_atomic_dedup_boundary.sql`: `v_existing` local variable now uses TEXT.

This aligns all four identified source mismatches with the earlier `20260907095500` TEXT column, the later text-first/security-hardening migrations, and the read-only production catalog. It avoids casting human-readable request identifiers (for example, `PA-YYYY-XXXXXXXX`) to numbers.

The change is source-branch-only. No production SQL, data, migration ledger, or Auth configuration was changed. Because the production ledger records migration names but not the exact SQL bodies/checksums, this repair still requires full clean replay and restored-backup validation; it must not be treated as proof that the checked-in historical SQL is byte-identical to the SQL originally applied in production. The disposable PostgreSQL workflow and settlement SQL behavioral suite must pass on the updated PR head before merge/deployment. If replay exposes further independent historical inconsistencies, stop and reconcile them rather than bypassing or skipping migrations.


### Follow-on clean-replay failures and source corrections — 2026-11-23

After the request-number type corrections, the next disposable replay advanced through the pre-authorization identity migrations and failed at the second `20260907140000` migration. It attempted to enable RLS on `public.pre_authorization_versions`, but the preceding migration creates `public.preauthorization_versions`.

A read-only production catalog query confirmed that the live table is `public.preauthorization_versions` (with the later-added `facility_id` column); there is no `public.pre_authorization_versions` table. The production migration ledger records `20260907140000_preauth_versions_workflow_hardening` as applied. The PR branch therefore corrects the erroneous RLS target to the canonical table name. The same incorrect underscored table reference was found in the unledgered `20260907144000_preauth_document_lifecycle.sql` version check and `20260907145500_preauth_version_action_refinement.sql` insert; both now use `public.preauthorization_versions`.

The next duplicate-version conflict was also identified by source inspection: both `20260907144000` files create `public.preauth_documents` with different shapes. The integrity variant creates the initial table without `format`, `storage_provider`, `content_sha256`, `status`, or `created_at`; the lifecycle variant subsequently uses those columns and creates a unique index including `format`. The lifecycle migration now adds those missing columns when absent, removes the narrower unique constraint from the initial variant, and applies the lifecycle uniqueness key (pre-authorization, version, document type, format), plus its version/status checks.

These are source-branch corrections only. The live production catalog currently has no `public.preauth_documents` table; its `register_preauth_document(uuid, integer, jsonb, text, uuid)` function returns the separate `preauth_document_registry` type. The live schema therefore does not prove that either of the two duplicate `20260907144000` source files was deployed. Neither of those duplicate migration names appears in the current 74-row production ledger snapshot. Preserve this distinction: the changes make the checked-in replay chain more internally consistent, but they do not establish historical SQL provenance or authorize production migration repair.

The disposable workflow was re-triggered by these source commits. It must complete the full ordered migration replay and execute the SQL behavioral tests before this PR can be considered merge-ready. If another migration fails, investigate its dependency and live/source evidence; do not skip it or bypass the replay gate.


The document lifecycle migration's added check constraints are guarded by catalog existence checks, so replay remains safe if the lifecycle-shaped table already exists instead of the integrity-shaped table. The source-only migration fixes now cover the observed table-name mismatch and the incompatible duplicate document-table shapes; the next disposable run is the required proof, not an assumption of success.


### Duplicate migration-version gate confirmed — 2026-11-23 17:00 UTC

The next disposable run on commit `c1bbafd357c94672dfba879adf77aecb0f16dd2c` started PostgreSQL and applied migrations through `20260907140000_preauth_atomic_hardening.sql`. It then attempted `20260907140000_preauth_versions_workflow_hardening.sql` and failed with SQLSTATE `23505`, duplicate key on `schema_migrations_pkey`. The two files share the same 14-digit migration version, so the CLI cannot record both as separate migrations. The failure occurs at migration-ledger insertion; it is not evidence that the table-name correction failed, and the replay did not reach the later document migrations or SQL tests.

The production ledger provides a crucial mapping: `20260907140000_preauth_versions_workflow_hardening` is recorded under production version `20260908182040`. The other `20260907140000` file is not separately present in the 74-row production ledger. This means a blind timestamp rename or arbitrary re-versioning could make the local chain diverge further from production. The remaining duplicate groups (`20260907144000` and `20260907145000`) also require a source-to-ledger mapping before they can safely be re-versioned.

The disposable workflow was retried after a separate Supabase CLI release API rate-limit failure. A full replay is still required; no migration was skipped and no production migration ledger or schema was modified. Do not merge/deploy while duplicate migration versions prevent a clean replay. Recover the authoritative migration bundle or verified backup and reconstruct the complete version mapping before resolving the duplicate version groups.


### Disposable test runner reliability — 2026-11-23

The retried disposable workflow also hit GitHub's unauthenticated release API rate limit because `supabase/setup-cli@v1` was configured with `version: latest`; the CLI was not installed and the migration replay was skipped. The workflow now pins the CLI to `3.0.0`, the stable version already used successfully by the earlier run that reached PostgreSQL migration replay. This removes the moving `latest` lookup from the CI setup step; it does not alter production configuration or migrations.


## Read-only production catalog cross-check — 2026-11-23

A further read-only catalog inspection was performed against production project `jajfdgknctzqypdtvmxo` after the disposable replay confirmed the duplicate `20260907140000` version. The project remains `ACTIVE_HEALTHY` on PostgreSQL 17.11. No production objects or data were changed.

Observed production objects:

- `public.preauthorization_versions` exists; `public.pre_authorization_versions` does not.
- `public.preauth_submissions` exists.
- `public.preauth_documents` and `public.preauth_audit_events` do not exist.
- The public `register_preauth_document(uuid, integer, jsonb, text, uuid)` wrapper returns `preauth_document_registry` and delegates to `security_internal.register_preauth_document`. This is materially different from either duplicate `20260907144000` source definition, both of which return `public.preauth_documents`.
- The public `preauth_snapshot(uuid)` wrapper delegates to `security_internal.preauth_snapshot`.
- No public `record_preauth_audit_event` or `transition_preauthorization_status` function was present in the inspected catalog.
- The live 74-row migration ledger records `20260907140000_preauth_versions_workflow_hardening` under version `20260908182040`. It contains no separate entries named for `preauth_atomic_hardening`, either duplicate `20260907144000` document migration, or either duplicate `20260907145000` audit/transition migration.

This is additional evidence that the duplicate source files are not represented as distinct applied migrations in the current production ledger, and that the current production document implementation is a separate registry-based design. It is **not** proof that the repository files are the original SQL deployed to production, nor does absence of an object prove that no equivalent behavior exists inside another schema or wrapper. Do not simply rename, delete, or replay these historical files based on this observation. Recover the verified backup/deployed source bundle, map the live wrappers and `security_internal` implementations, and design a reviewed forward-only migration sequence before removing the duplicate-version replay blocker.


## Expanded production pre-authorization implementation inventory — 2026-11-24

A second read-only catalog pass inspected the current production table and function signatures in both `public` and `security_internal`. This is a live-schema inventory, not a complete source-history reconstruction.

### Production tables observed

- `public.preauthorization_versions` — facility-scoped immutable revision rows.
- `public.preauth_submissions` — submission lifecycle rows with facility scope.
- `public.preauth_document_registry` — document snapshot/hash registry with facility scope; this is the active document metadata model, not `public.preauth_documents`.
- `public.preauth_handoff_log` and `public.preauth_email_log` — handoff/email history.
- `public.preauth_versions` — a separate legacy/version model also exists and must not be confused with `preauthorization_versions`.
- `public.audit_logs` and `public.security_audit_log` — audit tables observed; no `public.preauth_audit_events` table was found.

### Production function architecture observed

- Public `create_preauthorization_atomic` and `update_preauthorization_atomic` are SQL wrappers delegating to `security_internal` implementations.
- Public `preauth_snapshot` delegates to `security_internal.preauth_snapshot`.
- Public `register_preauth_document` delegates to `security_internal.register_preauth_document` and returns `preauth_document_registry`.
- Public `preauth_complete_fingerprint` has both a JSONB signature and a 16-argument typed signature; the typed signature delegates to `pre_auth_complete_fingerprint`.
- The live function inventory includes `transition_preauthorization_atomic`, not the source migration's `transition_preauthorization_status`.
- The live duplicate-guard and facility authorization logic resides in `security_internal` functions/triggers.

### Consequence for the duplicate migration groups

This evidence strengthens the conclusion that the repository's colliding early migrations are not a faithful standalone representation of the production pre-authorization schema:

1. `preauth_atomic_hardening` is not a distinct production ledger row. Its public function contract differs from the live public wrapper/security-internal implementation.
2. Both `preauth_document_integrity` and `preauth_document_lifecycle` target `preauth_documents`, which is absent in production. The live document registry has a different table and RPC return type.
3. `preauth_audit_events` and `preauth_workflow_transitions` are not present as the corresponding live table/function contracts. Production uses different audit tables and an atomic transition function.

**Disposition:** do not solve these collisions by simply re-versioning one file or merging their SQL. First recover the unmatched production migration sources (including the security-internal wrappers/implementations and document registry introduction), then classify each repository-only migration as superseded, never deployed, or required for clean bootstrap. The clean replay must reproduce the current production object model, not merely execute every historical source file in the current directory. No production mutation was performed.


## Production data-presence check — 2026-11-24

A read-only count-only query against production project `jajfdgknctzqypdtvmxo` returned:

| Object | Rows |
|---|---:|
| `public.facilities` | 0 |
| `public.facility_memberships` | 0 |
| Active facility memberships | 0 |
| `public.claims_settlement_periods` | 0 |
| Settlement periods with legacy advice/payment/WHT values | 0 |

This confirms there are currently no facility onboarding records, memberships, claims-settlement periods, or legacy advice rows in this production project. The remittance-ledger migration's legacy snapshot query therefore has zero source rows to migrate at the time of this observation. This is a point-in-time result, not a guarantee about later data changes.

Operational implication: the new facility-scoped claims settlement workflow cannot be verified against real production facility memberships or populated claims periods yet. The disposable database must seed test facilities, users, memberships and permissions for meaningful RLS/transaction tests. Production onboarding/data setup remains a separate controlled operational step; no facility, membership, claim or settlement data was inserted by this inspection.


## CareFlow mainline replay and SQL contract status — 2026-11-24 14:05 UTC

The mainline source tree has advanced beyond the earlier pre-authorization replay failures. On commit `d3d27d790273359a119f08777501c786e620f807`, the disposable Supabase workflow completed the ordered migration replay successfully and then executed all 10 SQL contract files with `psql -v ON_ERROR_STOP=1`; all 10 passed. The test runner was changed from `supabase test db` because the repository's existing `.test.sql` files are executable SQL/PLpgSQL assertion blocks, not pgTAP TAP suites. The direct `psql` runner executes each file and stops on the first SQL exception.

The successful disposable replay still uses **test-only normalization** to assign temporary unique versions to the three documented duplicate timestamp groups. The source filenames and production migration ledger were not renamed or repaired. Therefore this result establishes that the complete checked-in SQL sequence can execute in a disposable database under that explicit test-only ordering; it does not establish the authoritative production migration crosswalk or prove byte-for-byte equivalence with historical deployed SQL.

### Additional schema and permission corrections

- The permission catalogue's actual key column is `public.app_permissions.key`; `role_permissions.permission_key` and `user_permission_overrides.permission_key/granted` remain separate fields. Monthly-claim and settlement permission seeds, their contract tests, and the `admin-user-action` Edge Function now use those actual column names.
- `public.get_my_permissions()` now joins the catalogue through `app_permissions.key`, returns all catalogue permissions to system superusers/admins, and for ordinary users resolves only `role_permissions.granted = true` plus explicit per-user grants/denials.
- `security_internal.current_user_has_permission(text)` now respects revoked role grants while preserving the documented system-admin authority and explicit override behavior.
- Audit trigger functions have explicit EXECUTE revokes for `PUBLIC`, `anon`, and `authenticated`; PostgreSQL trigger invocation remains intact.
- Monthly aggregate claim posting now has an immutable, idempotency-key ledger, serializes same-period submissions, and links each submission to the matching monthly settlement period. The facility-approved provisional WHT rate remains separate from insurer-advised actual WHT.

The following checks on the same commit completed successfully:
- Disposable PostgreSQL Migration Tests: success (complete replay plus 10 SQL contract tests).
- CareFlow Quality Gate: success.
- Dependency Security Audit: success.
- GitHub Pages build, deployment, and published-site smoke test: success.

The separate CI workflow was still pending at the time of this entry; it must be checked before calling every check green.

### Production boundary remains unchanged

No production database migration, schema change, data insert/update, migration-ledger repair, Auth mutation, or Edge Function deployment was performed. The production project `jajfdgknctzqypdtvmxo` remains subject to the prior read-only inventory: 74 ledger rows, no facility or membership records, and no claims settlement periods at the last count. The source changes and passing disposable tests are not evidence that those changes have been applied to production.

Before any production migration rollout, retain the verified backup, recover the authoritative deployed migration bundle/crosswalk, and test against a restored copy of the production backup. The three duplicate source version groups remain documented technical debt and must not be blindly renamed in production.



## Live production compatibility audit — 2026-11-25 (read-only)

The connected Supabase project `jajfdgknctzqypdtvmxo` reports `ACTIVE_HEALTHY`, PostgreSQL 17.11, region `eu-west-1`, and project name **claims tracker**. The name does not match the repository product name; the owner must explicitly confirm project identity before a production release.

A fresh migration inventory returned 74 ledger rows. This is not a clean source-to-ledger match: the live ledger contains generated/imported names and version identities that differ from the current source filenames. The earlier 117-file source inventory and duplicate-version groups therefore remain unresolved.

### Live schema/function drift

Read-only inspection of live PostgreSQL function definitions found:

- `public.current_user_has_permission(text)` reads `user_permission_overrides.allowed`, joins `role_permissions` without requiring `granted = true`, and uses the older `app_permissions.permission_key` contract.
- `public.get_my_permissions()` also reads the older `app_permissions.permission_key` and `user_permission_overrides.allowed` contract.
- Current main-branch Edge Function source instead uses `user_permission_overrides.granted` and `app_permissions.key`. The deployed `admin-user-action` Edge Function is ACTIVE at version 4, but its retrieved source still uses the older `allowed` / `permission_key` columns. Do not deploy the main-branch function alone against the currently observed live schema.
- The live `role_permissions` table has RLS enabled and no policy. This is deny-by-default for direct table access and may be intentional because the catalogue is read through privileged helpers; do not add a broad policy simply to silence the advisor.
- The Security Advisor reports five authenticated-callable SECURITY DEFINER functions. They deny anon execution and have an empty `search_path`; the warnings require function-by-function authorization review, not blanket revocation of the RPCs required by the app.
- The live public-table inventory contains `claims_settlement_periods`, `facilities`, and `facility_memberships`, but does not contain `claims_settlement_remittances` or `monthly_claim_submissions`. Read-only counts returned 0 facilities, 0 facility memberships, and 0 settlement periods. The new aggregate-submission and remittance-ledger implementation is therefore not present in the observed production schema, and no facility has yet been onboarded in this database.
- The Security Advisor also reports leaked-password protection disabled. This is an Auth project setting and must be reviewed by an authorized project owner.

### Required coordinated release

Issue [#80](https://github.com/kingpumpski/careflow-hub/issues/80) tracks the permission/schema/Edge Function compatibility work. Resolve it only after:

1. The owner confirms that `claims tracker` is the intended CareFlow Hub production project.
2. A full backup has completed and its encrypted package has passed read-back checksum verification.
3. A restore rehearsal has passed on a separate project.
4. The 74 live migration records are mapped to the source SQL and actual schema effects.
5. The permission contract, monthly submission tables, remittance ledger, and RPC signatures have been tested on the restored copy.
6. The schema changes and matching Edge Function are deployed together under an approved release plan.

This audit was read-only. No production schema, table data, migration ledger, Auth users/settings, Edge Functions, or secrets were changed. The GitHub source changes do not establish that production has received those changes.


## Current source and replay status — 2026-11-25

The main-branch source tree now contains **141 SQL migration files**. The same three legacy duplicate version prefixes remain:

- `20260907140000`
- `20260907144000`
- `20260907145000`

The latest main commit at this review is `1fc030e4a09540043039a2a0c92a53c1987d5a98`. Its disposable PostgreSQL workflow completed the full migration replay and all SQL contract tests successfully (workflow run `45637863077`). The workflow explicitly assigns temporary unique versions to duplicate siblings **inside the disposable test job only**. It does not rename source files, modify the production ledger, or prove the production migration history is canonical.

This distinction supersedes the older statements above that the disposable replay was still failing at the pre-authorization request-number function. The historical mismatch remains relevant to source provenance, but the current replay harness now completes after the documented test-only normalization. The canonical migration history remains unresolved because the live ledger stores migration names/versions, not the SQL bytes originally executed.

The latest repository quality gate, CI, dependency audit and GitHub Pages deployment also passed on the same main commit (runs `45637863079`, `45637863129`, `45637863268`, and `45637863039`). The production Pages deployment is independent of Supabase schema deployment.

### Read-only source reconciliation tooling

The branch implementing this update adds:

- `npm run audit:migrations`: compares the repository SQL filenames with the committed 2026-11-22 ledger snapshot using the documented normalized-name heuristic.
- SHA-256 hashes for each current source migration, to support provenance and review.
- Explicit duplicate-version groups, unmatched ledger rows and unmatched source files.
- `npm run test:migration-audit`: unit tests for snapshot parsing, normalization, collision reporting and non-inference behavior.
- Quality-gate and CI steps that run the audit and its tests.

The tool reads only repository files and the historical snapshot. It makes **no database connection**, does not call Supabase, and does not classify an unmatched migration as applied or unapplied. The 2026-11-22 snapshot remains historical; the tool does not silently refresh it or imply that its 74 ledger rows are current.

### Production release boundary

No production DDL, data changes, migration-ledger repair, Auth changes, or Edge Function deployments are authorized by this work. A successful disposable replay is necessary but not sufficient. Production migration work remains blocked until the project owner confirms the target project, a complete encrypted backup is verified, a replacement-project restore rehearsal passes, and an evidence-backed mapping reconciles the actual live schema and migration ledger to the source.



## Read-only production compatibility refresh — 2026-11-25

The latest read-only inspection of production project `jajfdgknctzqypdtvmxo` confirms that the permission schema has a legacy shape which differs from the canonical schema used by the current source migrations:

| Object | Production shape | Canonical source shape |
|---|---|---|
| `app_permissions` | `permission_key`, `label`, `description` | `key`, `label`, `category`, `description` |
| `role_permissions` | `role`, `permission_key` (row means grant) | `role`, `permission_key`, `granted` |
| `user_permission_overrides` | `permission_key`, `allowed` | `permission_key`, `granted` |

The live public permission RPC reads `app_permissions.permission_key` and the override flag `allowed`. The private permission helper also uses the legacy override column. The current source versions of the scoped-settlement seed and permission repair migrations assume the canonical columns. Replaying those migrations unchanged against this production schema would fail or produce an incomplete permission contract.

The following relations and RPCs are still absent from production (verified by `to_regclass` / `to_regprocedure`):
- `public.settlement_exceptions`
- `public.settlement_exception_audit_events`
- `public.record_settlement_exception(uuid,text,text,text,text)`
- `public.transition_settlement_exception_atomic(uuid,text,text)`
- `public.claim_cases`
- `public.claim_case_events`

The existing `public.claims_settlement_periods` relation is present. The permission catalogue and scoped settlement permission seed need to be reconciled before the settlement exception RPCs can authorize claims officers safely.

The RBAC compatibility changes were merged in PR #103. They make the relevant permission migrations select the deployed column names at migration time, supporting both the canonical `key/granted` layout and the legacy `permission_key/allowed` layout. The `admin-user-action` Edge Function was deployed as version 5 after Deno type-checking; it probes the live schema and normalizes legacy rows for the existing UI. The explicit GitHub Pages origins were preserved. This is an Edge Function release only; no database migration was applied.

**Release boundary remains unchanged:** no production DDL, permission seed, database function replacement, migration-ledger repair, or data mutation was performed. The production project identity and complete migration crosswalk remain unresolved. Do not run `supabase db push --linked` or apply the missing table migrations until the ledger and source sequence have been reconciled and tested against a disposable/restored copy.


## 2026-11-25 settlement release preflight

The connected Supabase account currently exposes one project: `claims tracker`, ref `jajfdgknctzqypdtvmxo`, status `ACTIVE_HEALTHY`, region `eu-west-1`. The repository's `supabase/config.toml` points to this same ref. The owner should still confirm that this legacy-named project is the intended CareFlow Hub production target before database changes.

Additional read-only production checks confirmed:
- `public.claims_settlement_remittances` is missing.
- `public.claims_settlement_receipt_months` is missing.
- `public.record_claims_settlement_remittance(uuid,text,date,date,numeric,numeric,numeric,numeric)` is missing.
- `claims_settlement_periods.approved_gross_amount` and `claims_settlement_periods.actual_receipt_date` are missing.
- The current `public.claims_outstanding_periods` view does not reference `claims_settlement_periods` or `claims_settlement_remittances`; it remains on the older claims/payments/withholding-tax source path.
- Neither `claims.settlement.read` nor `claims.settlement.write` is present in the production permission catalogue.
- The `settlement_exceptions`, `settlement_exception_audit_events`, `claim_cases`, and `claim_case_events` relations and their corresponding RPCs remain absent.

The legacy remittance backfill preflight found zero `claims_settlement_periods` rows eligible for a legacy remittance snapshot. It also found no eligible rows with missing `created_by`, `created_at`, `updated_at`, or advice date values. This removes one known backfill-data risk, but does not remove the migration-ledger or project-identity release gates.

The source migration for the monthly claims view was corrected in PR #105 so the legacy individual-claim fallback retains all submitted gross, including claims later rejected; the rejected amount remains separately reported. PR #107 added full 14-by-14 SQL coverage to ensure the database claim lifecycle transition helper matches the UI transition matrix.

The production database remains read-only. No settlement permission rows, tables, columns, views, or database RPCs were added. Backup and restore work remains paused at the user's direction; the 74-row live migration ledger versus 141 source migration files, duplicate timestamp groups, and unmatched historical ledger entries still require a verified crosswalk before any production migration release.


## Read-only refresh — 2026-11-26

The owner-confirmed production project is Supabase `claims tracker` (`jajfdgknctzqypdtvmxo`), status `ACTIVE_HEALTHY`, PostgreSQL 17.11.0.003, region `eu-west-1`. The latest main commit audited was `e8e0a25222ca96c54cdb146f73a72784ee69fb29`.

- Live production migration ledger: **74 rows**.
- Current repository source tree: **141 SQL migration files**.
- Exact normalized ledger-name matches: **25**.
- Ledger names without an exact source filename match: **49**. These are not automatically missing migrations; renamed, consolidated and historical migration identities must be investigated semantically.
- Three duplicate source version-prefix groups remain: `20260907140000`, `20260907144000`, and `20260907145000`.
- The three duplicate groups are an explicit source-history/replay risk. Do not resolve them by renaming files or selecting one arbitrarily; the overlapping pre-authorization document contracts need catalog-level and historical SQL comparison.
- GitHub main CI passed at the audited commit, including migration replay, build, validation, quality and dependency audit. These checks do not prove that production's historical ledger is equivalent to the current source chain.
- The owner-confirmed project identity removes the prior identity uncertainty. Production migration release remains blocked until a verified backup and restore rehearsal exists and the semantic ledger/source crosswalk is reviewed.

No production DDL, data changes, migration replay, migration-ledger edits, Auth configuration changes, or `supabase db push --linked` were performed during this refresh. The 2026-11-22 and 2026-11-23 inventories above are retained as historical snapshots and must not be read as current counts.


## Duplicate-version semantic inspection — 2026-11-26

A source-level inspection of all six SQL files in the three duplicate timestamp groups was completed after the 2026-11-26 inventory refresh. This is a semantic review of the checked-in SQL, not proof that these exact bytes were deployed to production.

### `20260907140000` — atomic create and version/submission foundation

- `preauth_atomic_hardening.sql` defines the server-authoritative create/fingerprint path and initially defines `public.submit_preauthorization(uuid,text,text,text)`.
- `preauth_versions_workflow_hardening.sql` creates `preauthorization_versions` and `preauth_submissions`, plus snapshot/version/submission helpers.
- The latter file's initial `submit_preauthorization` definition contains an unscoped predicate, `WHERE id = id`, in its parent-status update. In isolation, that predicate can update every row in `public.pre_authorizations`, rather than only the submitted request.
- The later source migration `20260907154000_preauth_submission_lifecycle.sql` explicitly drops and recreates that same function, scopes the update to `p.id = p_preauth_id`, and adds facility authorization plus audit recording. This later definition supersedes the unsafe initial function in the full ordered source sequence. Do not execute or deploy the earlier definition as a standalone patch.
- The group still has a duplicate version identity. The later corrective migration does not make the two same-version files independently representable in the production ledger.

### `20260907144000` — incompatible document registry definitions

- `preauth_document_integrity.sql` creates `preauth_documents` with `file_name`, `storage_bucket`, `sha256`, `content_type`, and `generated_at`; its unique key is (preauth, version, document type). Its `register_preauth_document` signature accepts file/storage/hash/content-type arguments.
- `preauth_document_lifecycle.sql` is an explicit extension/replacement: it adds `format`, `storage_provider`, `content_sha256`, `status`, and `created_at`; replaces the narrower unique key with a key including format; drops the earlier register function signature; and creates a different argument contract.
- These are not two independent migrations that can safely be selected arbitrarily. The second file assumes the first table may already exist and evolves it, but the shared timestamp still prevents both from being independently recorded under that version.

### `20260907145000` — separate audit and transition responsibilities

- `preauth_audit_events.sql` creates the audit event table and `record_preauth_audit_event` RPC.
- `preauth_workflow_transitions.sql` defines `transition_preauthorization_status` and its state-transition matrix; it does not create the same audit table or RPC.
- These files are functionally distinct, but remain a duplicate migration-version collision. Their separate responsibilities do not remove the need for a canonical unique ordering.

### Production catalog comparison (read-only)

A read-only inspection of the live `public` function catalog on 2026-11-26 found:
- `public.create_preauthorization_atomic(jsonb,jsonb,boolean)` is a SQL wrapper delegating to `security_internal.create_preauthorization_atomic`.
- `public.register_preauth_document(uuid,integer,jsonb,text,uuid)` returns `preauth_document_registry` and delegates to `security_internal.register_preauth_document`; this is materially different from either checked-in `preauth_documents` function contract.
- No public `submit_preauthorization` or `transition_preauthorization_status` function was returned by the exact-name catalog query.

This confirms current production function contracts differ from the checked-in duplicate-group contracts. It does not establish which historical SQL was applied, whether these source functions were later replaced by other migrations, or whether the production registry is semantically equivalent. Recover original deployed SQL or a verified schema backup before classifying these files.

### Disposition

1. Keep all three duplicate version groups explicitly blocked from production migration release.
2. Preserve the later scoped `submit_preauthorization` definition; add/retain a regression test asserting a submission cannot change any other pre-authorization row.
3. Treat the two document definitions as an evolution chain for disposable replay only until their historical applied status and production registry mapping are proven.
4. Treat the audit and transition files as distinct changes that still need unique, dependency-correct identities in a future canonical bootstrap plan.
5. Do not rename source migrations, edit the live migration ledger, or apply production DDL based on this source-only inspection.

No production schema, data, migration ledger, Auth settings, or Edge Functions were changed during this review.


## Product-scope clarification — 2026-11-26

The project owner clarified that the Pre-Authorization module is a **document-preparation and generation tool**, not the primary source or system of record for insurer authorization submission.

The authoritative product boundary is already described in `docs/PREAUTHORIZATION_STUDIO.md` and is reinforced by migrations `20260907170000_preauthorization_scope.sql`, `20260908104000_disable_legacy_preauth_submission_execution.sql`, and `20260908113000_preauth_rpc_boundary_hardening.sql`:

- Capture and validate the request information and itemised charges.
- Create immutable document revisions and generate the PDF.
- Prepare the accompanying email package and open the officer's email client.
- Record that the package is **prepared** and handed to the officer; do not claim the email was sent or delivered.
- Insurer submission execution, insurer responses, approval/decline, authorization numbers, validity, follow-up and delivery reconciliation are outside this module.

### Correction to the duplicate-version review

The initial unscoped `WHERE id = id` in `20260907140000_preauth_versions_workflow_hardening.sql` is a source-history defect that must be understood in the replay sequence, but it is **not evidence that the production system currently executes that legacy insurer-submission RPC**:

1. `20260907140500_preauth_version_audit_trigger.sql` replaces the function with a scoped `WHERE p.id = p_preauth_id` update.
2. `20260907154000_preauth_submission_lifecycle.sql` later recreates the same legacy RPC with facility authorization and the scoped update.
3. `20260908104000_disable_legacy_preauth_submission_execution.sql` drops the legacy submit/process/complete/fail RPCs and revokes authenticated write access to the legacy `preauth_submissions` table.
4. `20260908113000_preauth_rpc_boundary_hardening.sql` repeats removal of those legacy execution RPCs and hardens the supported document/email-handoff RPC boundary.
5. `20260907170000_preauthorization_scope.sql` explicitly constrains the document/email handoff record to status `prepared` and removes insurer-delivery response fields.

The production catalog query that returned no public `submit_preauthorization` function is consistent with the intended boundary, not by itself a missing-feature defect. The separate document registry mismatch remains a migration-reconciliation issue and must be resolved using the actual production catalog and historical applied SQL.

### Interpretation for future implementation

Do not treat `preauth_submissions`, `submit_preauthorization`, insurer response tables, or payer integration adapters as mandatory core functionality. The supported handoff record is an internal record of document/email preparation. Internal review/approval of a prepared request, if retained by the facility workflow, must be clearly distinguished from insurer authorization approval. Do not silently map a local status such as `Approved` to an insurer decision.

This scope clarification changes the product requirements and prioritisation; it does not authorize deleting historical tables or editing deployed migrations. Any UI terminology or workflow refactor must preserve the current user experience unless a separately reviewed implementation is approved.


### Additional live finalisation-RPC mismatch — 2026-11-26

A focused read-only production inspection of the document-finalisation path found a concrete compatibility defect:

- Production has `public.preauth_submissions`, `public.preauth_document_registry`, `public.preauth_handoff_log`, and `public.preauthorization_versions`.
- Production does **not** have `public.pre_auth_submissions` (the distinct relation name with an underscore after `pre`).
- The live `security_internal.finalize_preauthorization_handoff(uuid,jsonb,numeric,jsonb,jsonb,text,text,text)` function definition contains `INSERT INTO public.pre_auth_submissions`. Its public wrapper delegates to this function.
- The repository's `20260910183000_harden_preauthorization_idempotency.sql` source uses the canonical `public.preauth_submissions` relation and includes an explicit regression contract in `supabase/tests/preauth_submission_idempotency.test.sql` that rejects the misspelled relation reference.
- The live migration ledger query returned the earlier finalisation/hardening entries (`restore_preauthorization_finalize_handoff`, `harden_preauth_finalize_duplicate_concurrency`) but did not return a row named `20260910183000_harden_preauthorization_idempotency`.

**Impact:** the production finalisation RPC references a relation that is absent from the live catalog. This is a strong static indication that the finalisation transaction can fail when it reaches that insert. No user-facing RPC was invoked to test this, and no production writes were attempted. The missing source migration ledger row and live function body mismatch are evidence of production/source drift; do not assume simply applying the source migration is safe until the complete migration crosswalk, backup and restore gates are satisfied.

**Scope:** this is a defect in the internal document-freeze/email-handoff record path, not a requirement to implement insurer-side submission. The fix must keep the module document-first, use the canonical handoff/idempotency records, and never re-enable external insurer queue processing.



## Permission-schema compatibility correction — 2026-11-26

This section supersedes the earlier interpretation in the 2026-11-25 compatibility refresh that described the live `permission_key/allowed` permission schema as necessarily incompatible with current source.

A fresh read-only inspection of the live production catalog confirmed:

- `public.app_permissions` exposes `permission_key` (not `key`).
- `public.user_permission_overrides` exposes `permission_key` and `allowed` (not `granted`).
- `public.role_permissions` exposes `role` and `permission_key`; a row represents a role grant and there is no `granted` column.

The current source migration `20260910090000_system_administrator_global_access.sql` explicitly probes for both catalog key variants (`key` or `permission_key`) and both override flag variants (`granted` or `allowed`). It also checks for `role_permissions.granted`; where that column is absent, it treats the existing role-permission row as a grant. Therefore, the live legacy shape is an intentionally supported compatibility variant for that migration, not by itself proof of a failed migration or a required production schema alteration.

The deployed `admin-user-action` Edge Function was checked directly on 2026-11-26:
- Status: `ACTIVE`
- Version: **5**
- JWT verification: enabled
- Its deployed source probes both legacy and canonical permission column variants, and normalizes the response to the UI contract.

This supersedes the older note that referred to deployed version 4 and the earlier assumption that the deployed function necessarily queried only canonical columns. Do not deploy or alter this function solely to rename the permission columns.

The compatibility review still needs to verify effective permission behavior in a restored copy: role-derived grants, explicit per-user allow/deny overrides, superuser/admin global access, and facility boundaries. In particular, the no-`granted` role table semantics should be tested against the exact live function definitions and intended role matrix. This is a semantic verification item, not a reason to add a broad RLS policy or change production grants.

The independent release blockers remain:
- the 74-row production migration ledger versus the current source migration set and unresolved duplicate version groups;
- missing settlement exception, remittance-ledger, receipt-month view and claim-case schema/RPCs;
- missing settlement permission catalogue entries;
- missing `approved_gross_amount` and `actual_receipt_date` columns on `claims_settlement_periods`;
- the Pre-Authorization finalizer drift documented above;
- the backup/restore release gate.

No production DDL, data, migration-ledger, Auth, Edge Function or permission configuration changes were made during this correction.



### Settlement permission rollout gap — 2026-11-26

The production permission compatibility finding must be separated from the missing scoped settlement role grants:

- The legacy permission **column shape** is supported by the current migration and deployed `admin-user-action` v5 (see correction above).
- Production currently has `payments.read` and `payments.write` in the permission catalogue and grants them to `accounts_officer`, `admin`, and `superuser`.
- Production does **not** have `claims.settlement.read` or `claims.settlement.write` in the permission catalogue or `role_permissions`.
- The production `claims_officer` role has `claims.read` and `claims.write`, but no `payments.read/write` and no scoped settlement permissions. Therefore a claims officer is denied the settlement register and payment-advice actions by the current UI permission checks, while accounts officers retain access through their existing payment permissions.
- The source migration `20261123140000_claims_settlement_scoped_permissions.sql` seeds `claims.settlement.read/write` for `claims_officer` (and admin/superuser), preserving the intended least-privilege boundary: claims officers do not gain general `payments.write` or `ledger.write`.

The production preflight now checks the intended role grants explicitly. Both claims-officer settlement permission checks return BLOCKED; the two accounts-officer payment permission checks return PASS. The missing scoped grants are a real operational permission rollout blocker for the claims department, not a column-name compatibility problem.

Do not patch the live role-permission rows manually. The permission seed migration must be included in the reviewed forward release after backup/restore and migration-ledger reconciliation, then verified with representative claims-officer and accounts-officer identities in the restored copy.


## Live settlement/claim-case ledger cross-check — 2026-11-26

A read-only query against the owner-confirmed production project's `supabase_migrations.schema_migrations` filtered names containing `settlement` or `claim_case`. It returned only:

| Production ledger version | Name |
|---|---|
| `20260908234726` | `add_actual_withholding_tax_settlement_state` |
| `20260909064811` | `claims_settlement_period_model` |
| `20260909135839` | `index_claims_settlement_period_foreign_keys` |

No claim-case or newer settlement exception/remittance migration names were returned. The live catalog independently lacks the settlement exception tables/RPCs, remittance ledger/RPC, receipt-month view, claim-case tables/RPCs, and the `approved_gross_amount` / `actual_receipt_date` columns. This is consistent with the newer source feature migrations not being deployed; it does not identify the exact historical SQL bodies or prove the entire migration ledger is reconciled.

The repository includes the newer migrations:
- `20260908150000_settlement_exception_register.sql` and `20261120160000_settlement_exception_atomic_lifecycle.sql`
- `20261120170000_individual_claim_case_lifecycle.sql`
- `20261123140000_claims_settlement_scoped_permissions.sql`
- `20261123153000_add_claims_settlement_remittance_ledger.sql`
- `20261123160000_match_aggregate_claims_periods_and_receipt_months.sql`
- `20261123170000_add_claims_settlement_remittance_reversals.sql`
- `20261123173000_exclude_reversed_remittances_from_receipt_reporting.sql)

These source migrations have passed the repository's disposable migration replay and SQL contract suite on the merged PR #122 head, but that test does not prove production ledger equivalence. Before any production deployment, compare their exact effects with a verified restored copy, including the monthly aggregate-vs-individual claim fallback, approved gross/rejection variance, provisional-vs-actual WHT replacement, multi-remittance totals, reversal exclusion, receipt-month grouping, facility RLS and role permissions.

No production migration, data, permission or ledger changes were performed during this cross-check.


## Read-only production refresh — 2026-11-27

A fresh SELECT-only check against project `jajfdgknctzqypdtvmxo` reconfirmed a 74-row migration ledger with latest version `20260921160938`. The repository now includes the merged prepared-handoff correction and SECURITY INVOKER wrapper hardening, but production still lacks `public.preauthorization_submissions`; the legacy `public.preauth_submissions` relation remains present. This is repository/production drift, not evidence that the source migration has been deployed.

The live schema also still lacks settlement exception tables, remittance ledger, claim-case tables, and the two settlement-period advice columns `approved_gross_amount` / `actual_receipt_date`. The `claims.settlement.read/write` permission catalogue entries and claims-officer grants remain absent. `facilities` and `facility_memberships` both contain zero rows.

The source migration chain passes the disposable CI replay, but the disposable job temporarily normalizes the three documented duplicate prefixes. That validates the normalized test sequence; it does not reconcile the original production migration history or prove equivalence of historical SQL bodies. Continue to treat the complete semantic crosswalk and verified restore replay as mandatory.

No production schema, data, grants, Auth settings, Edge Functions or migration ledger were changed during this check.


## Current read-only refresh — 2026-11-28 09:17 UTC

The current repository base commit for this refresh is `296af07ff08626f74d7975d112beaa9778a53608`. A fresh Supabase migration API read and GitHub migration-tree inventory confirm:

- Production migration ledger: 74 rows; latest version `20260921160938`, name `fix_facility_policy_recursion_runtime`.
- Repository migration files: 146 SQL files.
- Direct normalized-name matches: 56.
- Ledger rows without unique direct source match: 18.
- Source files without direct ledger-name match: 90.
- Later-version source candidates: 32.
- Duplicate version groups: three, unchanged from the historical findings.

The duplicate groups remain:
- `20260907140000`: `20260907140000_preauth_atomic_hardening.sql` and `20260907140000_preauth_versions_workflow_hardening.sql`.
- `20260907144000`: `20260907144000_preauth_document_integrity.sql` and `20260907144000_preauth_document_lifecycle.sql`.
- `20260907145000`: `20260907145000_preauth_audit_events.sql` and `20260907145000_preauth_workflow_transitions.sql`.

The automated disposable replay normalizes duplicate versions for test execution. That normalization is test-only and does not establish which historical SQL was applied to production. The existing historical pre-authorization request-number type conflict remains a source-replay/provenance issue; do not rewrite or skip the historical migration to force a green replay. Recover authoritative applied SQL or document an approved forward-only baseline strategy, then rehearse the complete sequence against a restored copy.

The reconciliation audit runner now defaults to `docs/MIGRATION_LEDGER_SNAPSHOT_2026-11-28.md`. The dated snapshot preserves the full 74-row production ledger and direct-name crosswalk. No production migration, schema, data, grant, Auth or migration-ledger mutation was performed.


## Report source release update — 2026-11-28

The claims-cycle Settlement Reconciliation report merged in PR #143 (`8c62f9710b7fa4c9bae47c1a4927496306ccf14e`). It uses the existing settlement-period source and does not add or apply a production migration. The current Operational Performance report branch is also source-only. No production schema, data, migration-ledger or permission changes were made.


## Operational report merge — 2026-11-28

PR #144 merged as `42b0f5c0f23bf47acc878042b20aa976122c9a2a`. It adds operational performance reporting against existing claims, payments, settlement-period, outstanding-period and audit-log sources. No production migration was added or applied. The production migration ledger and provenance blockers remain unchanged.
