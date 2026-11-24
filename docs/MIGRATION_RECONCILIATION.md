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
