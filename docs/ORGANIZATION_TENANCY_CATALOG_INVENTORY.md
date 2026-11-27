# Organization-tenancy catalogue inventory

**Status:** Read-only discovery tooling; no tenant migration is authorized by this document.
**Related work:** [Phase 2 tenancy issue #2](https://github.com/kingpumpski/careflow-hub/issues/2), [organization tenancy design](ORGANIZATION_TENANCY_DESIGN.md).

## Purpose

Before adding tenant ownership to CareFlow, we need a complete and repeatable view of the deployed database's actual structure. The catalogue inventory at `supabase/diagnostics/organization-tenancy-inventory.sql` reports:

1. Tables, partitions, views and materialized views, including RLS flags and likely ownership/scope columns.
2. All foreign keys, including composite references and validation state.
3. Exact RLS policy roles, commands, `USING` and `WITH CHECK` expressions.
4. View definitions and view options, including whether security-invoker behavior is configured.
5. Application functions/RPCs, argument signatures, security-definer state, function settings, execute grants and definitions.
6. Non-internal triggers and their definitions.
7. Presence of organization, facility, Storage and migration-ledger relations.

The script reads PostgreSQL system catalog metadata only. It does not read patient, claim, payment or other business row contents. It contains no DDL or DML and does not apply migrations.

## How to run

1. Confirm the Supabase project reference and environment before opening its SQL Editor.
2. Run the complete SQL file: `supabase/diagnostics/organization-tenancy-inventory.sql`.
3. Export or securely retain all seven result sets as schema metadata. Do not attach production business records or credentials to the inventory.
4. Compare the results with the repository migration history and generated Supabase types.
5. Classify every business relation as organization-owned, facility-owned, global reference data, platform/security data, or derived/read-only data.
6. For every cross-table reference, record the intended ownership path and whether a composite tenant-aware foreign key is required.
7. Record all views, RPCs, triggers, Storage policies, Edge Functions, imports, exports, realtime subscriptions and offline replay paths that read or mutate the relation.

## Review rules

- An `organization_id` column alone is not proof of tenant isolation.
- A foreign key on `id` alone may permit a row from another organization to be referenced. Tenant-owned references need a verified same-tenant constraint or an equivalent trusted server-side invariant.
- RLS enabled without a tenant-aware policy is not sufficient. Review both `USING` and `WITH CHECK`, and preserve least-privilege behavior.
- SECURITY DEFINER functions require individual review of caller authorization, fixed search path, execute grants, and tenant validation inside the function.
- Views must be reviewed for invoker security and whether their underlying access bypasses the intended tenant boundary.
- Storage objects, Edge Functions, scheduled jobs, exports, AI context, offline caches and queues need their own tenant-boundary checks; table RLS does not automatically secure these paths.
- Do not infer organization ownership for existing rows from user roles, facility membership, insurer identity, or current account count. Ambiguous rows require an explicit review queue and approved mapping.
- Do not rewrite applied migrations or resolve duplicate version prefixes by renaming files without the semantic migration crosswalk.

## Current known blockers

The 2026-11-27 read-only snapshot records 74 production migration-ledger entries (latest applied version `20260921160938`) versus 143 SQL migration files in the current repository source. This is a filename/count discrepancy, not proof that all 69 additional files are unapplied: some files have duplicate version prefixes, overlapping historical contracts, or non-direct ledger-name matches. The existing migration reconciliation report and semantic crosswalk remain mandatory.

The connected production project has no `organizations`, `organization_memberships` or `organization_module_entitlements` tables. Facilities and facility memberships are present but empty. Several core relations still use permission-only policies, so facility scoping must not be represented as organization isolation.

## Exit criteria for the inventory phase

- Every deployed relation and application-facing database function is classified.
- Every tenant-owned foreign-key path has an explicit ownership rule.
- Existing rows have a deterministic, reviewed organization mapping or are explicitly marked unresolved.
- RLS, views, RPCs, triggers and Storage policies have an owner-by-owner remediation plan.
- The production migration ledger has a semantic crosswalk to repository source.
- Encrypted backup and separate-project restore evidence is complete before any structural migration is released.

Until these criteria are met, this script is diagnostic only. It does not enable multi-tenancy and is not a production migration.
