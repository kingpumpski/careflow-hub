# Organization data ownership and referential-integrity crosswalk

**Status:** Preliminary design crosswalk; not an approved migration.
**Evidence date:** 2026-11-27
**Related work:** [Organization tenancy design](ORGANIZATION_TENANCY_DESIGN.md), [catalogue inventory](ORGANIZATION_TENANCY_CATALOG_INVENTORY.md), [Phase 2 tenancy issue #2](https://github.com/kingpumpski/careflow-hub/issues/2).

## 1. Design rule

The organization is the top-level tenant. A facility is an operational location inside exactly one organization. Facility membership narrows access within that organization; it must never independently grant access to another organization.

Every business relation must have one explicit ownership classification:

- **Organization-owned:** carries an organization key and is accessible only to active members of that organization with the required permission.
- **Facility-owned:** carries a facility key and an organization key (or an equivalent database-enforced composite ownership path) and requires both active organization membership and facility access.
- **Parent-owned child:** inherits ownership from a parent relation and must have a same-tenant composite foreign key or an equivalent trusted database invariant.
- **Global reference:** platform-managed, immutable or tightly controlled catalogue data, with no tenant-specific business data mixed into it.
- **Platform/security:** identity, platform roles, security configuration and platform-wide audit events; not implicitly exposed to tenant members.
- **Derived:** view/report data whose source relations and joins must preserve the same tenant boundary.

A UI filter, a client-supplied `organization_id`, an ordinary single-column UUID foreign key, or RLS being enabled is not sufficient proof of tenant isolation.

## 2. Preliminary ownership crosswalk

The classifications below are based on the live catalogue snapshot and the repository's current facility-scoped migration contracts. They are proposed ownership rules, not claims that the connected production database has already deployed them.

| Relation / domain | Proposed ownership | Evidence and required relationship |
|---|---|---|
| `organizations` | Platform-managed tenant root | Not present in production or current source migrations. Add stable tenant identity, status and configuration. |
| `organization_memberships` | Organization-owned membership | Not present. Bind `organization_id` to `auth.users.id`; membership state and role must be checked server-side. |
| `facilities` | Organization-owned child | Existing table has no `organization_id`. Add only after an approved organization mapping; preserve facility UUIDs. |
| `facility_memberships` | Facility child of organization membership | Existing `facility_id` and `user_id` FKs exist. Require the user to be an active member of the facility's organization as well as the facility. |
| `claims` | Facility-owned aggregate claim register in current source contract | Migration `20260908130000_core_facility_rls_hardening.sql` adds `facility_id`; `20261124120000_scope_monthly_claim_posting_to_facility.sql` uses it for monthly submission. Production currently lacks this column. Preserve the distinction between aggregate claim periods and external detailed claim transactions. |
| `payments` | Facility-owned, linked to claim | Source migration adds `facility_id`; existing `claim_id` and insurer references are single-column FKs. Enforce same-facility/same-organization claim and insurer references. Production currently lacks `facility_id`. |
| `withholding_tax` | Facility-owned financial evidence | Source facility hardening adds `facility_id`. Keep provisional and actual WHT classification; do not combine tenant scoping with a change to the financial calculation. |
| `ledger_entries` | Facility-owned immutable financial posting | Source migration `20261124120000` adds `facility_id` and facility-scoped policies. Production currently lacks this column and its source policy contract. |
| `patients` | Facility-owned in current source model; cross-facility sharing requires an explicit product decision | Source migration adds `facility_id`; live production does not. Patient records must not be visible across organizations by default. |
| `insurance_companies` | Facility-managed reference data in current source model | Source facility hardening adds `facility_id`; monthly submission RPC verifies that the selected insurer belongs to the selected facility. Do not silently convert this into a global shared insurer catalogue. |
| `client_companies`, `doctors`, `procedures` | Facility-managed reference data in current source model | Source facility hardening adds `facility_id`. A later product decision may introduce centrally managed catalogue templates with tenant-owned copies. |
| `pre_authorizations` | Facility-owned document preparation | Live table has nullable `facility_id`; normal policies require facility access and a non-null facility. Enforce same-facility patient, insurer, doctor and procedure references. This module prepares documents and internal handoffs only; insurer submission and approval remain external. |
| `preauth_items`, `preauthorization_versions`, `preauth_client_suggestions`, `preauth_document_registry`, `preauth_handoff_log`, `preauth_email_log` | Facility-owned or parent-owned children | Derive scope from the parent pre-authorization/document and enforce matching facility. Keep the legacy `preauth_submissions` queue distinct from the canonical prepared-handoff register. |
| `claims_settlement_periods` | Facility-owned settlement cycle | Live table has required `facility_id` and insurer FK. Require the insurer to belong to the same facility/organization. |
| `claims_settlement_remittances` | Parent-owned child of settlement period | Source table references `settlement_period_id`; derive organization/facility through the parent and enforce that relationship with a composite FK or equivalent guarded write path. Advice date and cash receipt date remain distinct. |
| `monthly_claim_submissions` | Facility-owned immutable submission snapshot | Source table has `facility_id`, insurer, claim and settlement-period references. Enforce that all referenced rows belong to the same facility/organization. |
| `claim_cases` | Facility-owned individual claim workflow | Source migration creates facility-scoped cases, separate from the insurer-level monthly aggregate `claims` table. |
| `claim_case_events` | Parent-owned immutable child | Event facility must match the referenced claim case facility. Current simple FKs should be supplemented by a composite same-facility relationship. |
| `settlement_exceptions` | Parent-owned child of settlement period | Facility and settlement period must match. Lifecycle writes must remain atomic and audited. |
| `settlement_exception_audit_events` | Parent-owned immutable child | Event facility must match its exception and settlement period. Never permit direct client mutation of audit history. |
| `claims_outstanding_periods` | Derived organization/facility report | Current view is `security_invoker=true`, but its underlying claims, payments and WHT sources need tenant-aware RLS and tenant-preserving joins. |
| `notifications` | User-owned with organization context for tenant events | User recipient alone is not enough to distinguish notifications created in different organizations. Add explicit organization context for tenant events; retain platform notifications separately. |
| `chat_messages` | Organization-scoped conversation or explicitly user-to-user | Define whether a thread is tenant-specific. Do not allow a user who belongs to two organizations to bridge private messages across tenants by reusing a thread key. |
| `diagnosis_codes` | Global reference catalogue, subject to product confirmation | Keep shared clinical code data separate from tenant-managed labels or custom codes. |
| `profiles` | Global identity profile | One Auth identity can belong to multiple organizations; do not duplicate profiles per tenant. |
| `user_roles` | Platform-level roles only | Do not use a global role as a substitute for organization-scoped membership/role. A platform superuser must not become an implicit member of every tenant. |
| `app_permissions`, `role_permissions`, `user_permission_overrides` | Platform permission catalogue plus organization-scoped authorization resolution | Keep permission keys centrally defined. Resolve the member's effective role/overrides in the active organization; preserve the current legacy-compatible RBAC schema until its migration is reconciled. |
| `audit_logs`, `security_audit_log` | Tenant audit vs platform security audit | Tenant business events need an immutable `organization_id` and actor. Platform security events remain separately controlled and must not be exposed as tenant audit data. |
| `system_settings` | Organization settings plus separate platform configuration | Move business branding, facility defaults and reporting preferences to organization/facility settings. Keep platform-wide kill switches outside tenant-controlled settings. |
| Storage objects and exports | Organization/facility-owned by metadata and policy | Require path and object metadata to identify organization/facility, but validate membership in Storage policies and server functions; path prefix alone is not authorization. |

## 3. Referential-integrity contract

### 3.1 Facility ownership

After an organization has been explicitly provisioned and every existing facility has an approved mapping:

- Add a unique key on `facilities (organization_id, id)`.
- Add a matching organization/facility ownership pair to facility-owned rows.
- Add composite foreign keys such as `(organization_id, facility_id) → facilities(organization_id, id)`.
- Require a user referenced by `facility_memberships` to have an active `organization_memberships` row for the same organization.
- Ensure update policies and triggers prevent changing `organization_id` or `facility_id` to a different tenant.

### 3.2 Parent-child records

For facility-owned child records, use a parent key that includes the tenant boundary. Examples:

- `claim_case_events (organization_id, facility_id, claim_case_id)` → `claim_cases (organization_id, facility_id, id)`.
- `settlement_exceptions (organization_id, facility_id, settlement_period_id)` → `claims_settlement_periods (organization_id, facility_id, id)`.
- `settlement_exception_audit_events (organization_id, facility_id, exception_id)` → `settlement_exceptions (organization_id, facility_id, id)`.
- `claims_settlement_remittances (organization_id, facility_id, settlement_period_id)` → `claims_settlement_periods (organization_id, facility_id, id)`.
- `monthly_claim_submissions` must reference a claim, settlement period and insurer that all resolve to the same facility and organization.

If a table intentionally derives ownership only from its parent, document that contract and ensure the only write path validates the parent under the authenticated actor. A single-column UUID FK is not a cross-tenant integrity constraint.

### 3.3 Shared reference data

A catalogue can be global only if it contains genuinely shared, platform-controlled reference values. Organization-specific insurers, doctors, procedures, client companies, tariffs and custom codes must be tenant-owned or tenant-copied. Do not mix global catalogue rows and tenant-managed rows in one table without an explicit ownership discriminator and RLS design.

## 4. Generated TypeScript schema drift

A read-only Supabase type generation from the live project was compared with `src/integrations/supabase/types.ts` on 2026-11-27:

- Live generated schema: 35 public table definitions.
- Repository type file: 25 public table definitions.
- Twelve live table definitions are absent from the repository type file: `app_permissions`, `facilities`, `facility_memberships`, `preauth_client_suggestions`, `preauth_document_registry`, `preauth_handoff_log`, `preauth_insurer_tariffs`, `preauth_submissions`, `preauthorization_versions`, `role_permissions`, `security_audit_log`, and `user_permission_overrides`.
- The repository type file contains two backup table definitions (`backup_runs`, `backup_settings`) that were not present in the live generated schema.
- Live `pre_authorizations` has additional document/facility/request identity columns absent from the repository type file.
- Repository `claims_settlement_periods` types include `approved_gross_amount` and `actual_receipt_date`, which are absent from the live schema.
- The current source migrations add facility ownership columns to core tables that are absent from the live schema.

This confirms the generated type file does not represent one coherent schema snapshot. Do **not** replace it with types generated from the older production schema: that would erase source-side capabilities. The next implementation should generate types from the fully replayed repository migration chain in disposable PostgreSQL, compare them with the checked-in type contract, and update the source types only from that reviewed schema. Production-generated types remain useful for identifying deployment drift, not as the source-of-truth for the latest application schema.

## 5. Unresolved product and migration decisions

1. Can a patient be shared across multiple facilities inside one organization, or must each facility own its patient record?
2. Are insurers, doctors, procedures, tariffs and client companies tenant-managed, centrally curated, or centrally templated with organization-owned copies?
3. Are notifications and chat threads organization-scoped, user-scoped, or both?
4. Which existing historical claims/payments/patient/ledger rows can be deterministically assigned to a facility? Rows without a trusted parent or source mapping must remain unresolved until reviewed.
5. What is the approved initial organization record and provisioning actor? Do not infer it from the current superuser account.
6. Which existing global roles remain platform-only, and which permissions become organization-role assignments?

## 6. Explicit release blockers

- No organization or organization-membership tables exist in production.
- Existing core financial tables in production do not yet carry the facility ownership columns expected by current source migrations.
- Production migration history and repository migration source remain unreconciled; duplicate migration versions and overlapping contracts must be mapped semantically.
- Encrypted backup and separate-project restore rehearsal remain incomplete.
- Tenant-aware composite foreign keys, RLS, RPCs, views, Storage policies, Edge Functions, caches and offline sync have not yet been implemented or proven end-to-end.
- The pre-authorization public finalizer in production still differs from the merged source security contract. Keep that capability disabled until reconciled.

No production schema, data, permissions, migration ledger, Auth settings or Edge Functions were changed to create this crosswalk.
