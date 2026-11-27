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


## Targeted live baseline — 2026-11-27

The connected project `claims tracker` (`jajfdgknctzqypdtvmxo`, PostgreSQL 17.11, ACTIVE_HEALTHY) was inspected with read-only catalogue queries. This is a targeted baseline of the core claims, finance, facility and pre-authorization relationships, not a substitute for running and retaining every result set from the full inventory script.

The complete seven-section inventory SQL was also executed successfully against that confirmed project. It returned 89 relations, 86 foreign-key constraints, 109 RLS policies, 4 views/materialized views, 38 application or privileged Storage functions, 21 non-internal triggers, and 10 object-presence checks. These are catalogue-object counts, not business-row counts. The outputs should be retained as the baseline artifact for the semantic crosswalk.

### Organization and scope keys

- `organizations`, `organization_memberships`, and `organization_module_entitlements` are absent.
- `facilities` has no `organization_id`.
- `facility_memberships` contains `facility_id` and `user_id`, with foreign keys to `facilities.id` and `auth.users.id`.
- `claims_settlement_periods` has a required `facility_id`, plus insurer and actor references.
- `pre_authorizations` has a nullable `facility_id`; its patient, insurer, doctor and procedure references are ordinary single-column foreign keys.

### Core financial ownership gaps

The inspected `claims`, `payments`, `patients`, and `ledger_entries` relations have no `organization_id` or `facility_id` column. Current foreign-key paths include:

- `payments.claim_id → claims.id`
- `claims.preauth_id → pre_authorizations.id`
- `claims.insurance_company_id → insurance_companies.id`
- `patients.client_company_id → client_companies.id`
- `patients.insurance_company_id → insurance_companies.id`
- `ledger_entries.insurance_company_id → insurance_companies.id`

These are valid referential links, but they do not establish a tenant boundary. The ownership crosswalk must determine whether monthly aggregate claims and ledger data belong to an organization, whether patients are organization-shared across facilities, and how shared insurer/reference catalogues are classified. Tenant-aware composite foreign keys are required where records from separate organizations must not be linked.

### RLS and reporting observations

- RLS is enabled on the inspected base tables, but `claims`, `payments`, `patients`, and `ledger_entries` currently have permission-oriented policies rather than organization-membership predicates. RLS being enabled is therefore not evidence of multi-tenant isolation.
- `pre_authorizations` policies include facility access checks and require a non-null facility for normal access; this is a lower-level facility boundary, not an organization boundary.
- `claims_settlement_periods` policies use facility access, while the core financial tables above do not share that same facility scope.
- `claims_outstanding_periods` is configured with `security_invoker=true`, which is appropriate for preserving underlying table access checks. Its underlying claims, payments and withholding-tax sources still need tenant-aware policies before the view can be considered tenant-isolated.

### Pre-authorization finalizer discrepancy

The live public `finalize_preauthorization_handoff(uuid, jsonb, numeric, jsonb, jsonb, text, text, text)` wrapper remains `SECURITY DEFINER`, with an empty search path, authenticated execution and no anonymous execution. The merged source contract in `20261126160000_harden_prepared_preauth_wrapper_security.sql` expects a `SECURITY INVOKER` public wrapper delegating to the guarded private implementation. Keep the prepared-document handoff capability disabled until the production function definition, grants and private helper authorization are reconciled and verified. This function records an internal prepared handoff only; insurer submission and approval remain external.

No production schema, data, grants, Auth configuration, Storage objects or Edge Functions were changed during this inspection.
