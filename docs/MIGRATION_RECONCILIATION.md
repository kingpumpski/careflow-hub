# Migration version reconciliation

## Current verified source-tree finding

The main branch at audit commit `7f77b4a78c35115a018127ed69696047feb3dde2` contains 116 SQL migration files and three duplicate 14-digit version prefixes:

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
