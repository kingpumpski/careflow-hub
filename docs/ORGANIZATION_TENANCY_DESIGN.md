# Organization tenancy — discovery and migration design

**Status:** Design proposal only. No production schema or data has been changed.
**Discovery date:** 2026-11-21
**Related work:** [Issue #2](https://github.com/kingpumpski/careflow-hub/issues/2), [facility onboarding PR #53](https://github.com/kingpumpski/careflow-hub/pull/53), [individual claim cases PR #52](https://github.com/kingpumpski/careflow-hub/pull/52).

## 1. Executive decision

CareFlow currently has a facility-membership boundary, but the connected database does not yet have an organization/tenant entity or organization-membership relation. Facility scoping is not equivalent to organization tenancy.

Implement organization tenancy as a staged, forward-only migration. Preserve the existing Ghana deployment as one explicitly provisioned organization, preserve existing facility identifiers, and make organization membership the top-level data boundary. A user may belong to multiple organizations and may hold different organization-scoped roles in each.

Do not add nullable `organization_id` columns everywhere and declare the application multi-tenant. The migration is complete only when database constraints, RLS, RPCs, views, storage access, audit events, and application context all enforce the same tenant boundary.

## 2. Live schema observations

Read-only catalog queries against the connected Supabase project on 2026-11-21 showed:

- `facilities` and `facility_memberships` exist. Memberships reference `facility_id` and `user_id`, with facility role/status fields.
- There are no public tables named `organizations` or `organization_memberships`.
- `facilities` has no `organization_id` column.
- `pre_authorizations` has a nullable `facility_id`; its active RLS policies require a non-null facility and facility access.
- The insurer-level `claims` aggregate table has no `facility_id` or `organization_id`. It currently references `insurance_companies`.
- `patients`, `payments`, and `ledger_entries` also have no facility/organization key in the inspected schema.
- RLS is enabled on the inspected core tables. Current policies for claims, patients, payments, and ledger entries primarily check application permissions; they do not establish an organization membership predicate.
- `payments.claim_id` references `claims.id`; claims and payments therefore need a consistent tenant ownership model before their access boundaries can be considered isolated.
- `audit_logs` and `security_audit_log` exist, but the inspected schemas do not expose an organization key on either table.

These observations are a snapshot, not a complete inventory of every table, view, function, storage bucket, or Edge Function. Re-run catalog discovery before generating implementation migrations.

## 3. Target domain model

### 3.1 Organization and membership

Introduce:

- `organizations`: stable tenant identity, display name, unique slug/code, country/jurisdiction defaults, status, configuration, timestamps.
- `organization_memberships`: organization, user, organization-scoped role, status, inviter/activation metadata, timestamps.
- A unique active membership rule per (organization, user), implemented with a suitable unique constraint/index and explicit lifecycle handling.

A user can belong to more than one organization. Global platform support roles remain separate from organization-scoped roles; a global superuser must not become an accidental default tenant member.

### 3.2 Facilities

Add non-null `facilities.organization_id` after a deterministic backfill. Enforce organization ownership of facility memberships through a trusted database path. A facility membership is valid only when its user is also an active member of the facility's organization.

Facility roles remain narrower than organization roles. Existing facility membership and onboarding workflows must continue to work, but they must not independently grant access to another organization.

### 3.3 Business records and ownership

Classify every table before adding tenant keys:

| Domain | Candidate ownership rule | Required decision |
|---|---|---|
| Individual claim cases | Facility → organization | Keep facility boundary and enforce parent organization consistency |
| Pre-authorizations | Facility → organization | Make facility ownership mandatory; enforce same-organization patient/insurer references |
| Monthly aggregate claims | Organization, with insurer and reporting period | Preserve aggregate semantics; do not invent a facility association |
| Payments and withholding tax | Same organization as the financial claim/settlement record | Prevent cross-organization claim/payment links |
| Ledger and settlement records | Organization; optionally facility where operationally meaningful | Preserve immutable financial history and balanced posting invariants |
| Patients | Organization, optionally facility | Decide whether a patient can be shared across facilities within one organization; never across organizations by default |
| Insurance companies, procedures, diagnosis codes | Explicitly classified reference data | Decide whether records are global catalog entries or tenant-managed copies |
| Users/profiles | Global identity, tenant-scoped membership | Do not duplicate Auth users per organization |
| Audit/security logs | Organization context plus actor | Keep platform-wide security events distinct from tenant audit events |

The final inventory must include all public tables, partitions, views/materialized views, functions, triggers, Storage objects, Edge Functions, imports, exports, offline queues, and background jobs.

### 3.4 Referential integrity

Where two tenant-owned records reference one another, use composite tenant-aware foreign keys where practical (for example, unique `(organization_id, id)` keys and matching composite foreign keys). This prevents a valid UUID from another organization being attached through an otherwise permissioned write.

Do not rely only on UI filters or a client-supplied `organization_id`. The server must derive or validate active organization membership for every operation.

## 4. Authorization model

1. The authenticated user identity comes from `auth.uid()`; never use user-editable `user_metadata` for authorization.
2. The active organization is selected from the user's verified memberships and validated server-side on every request.
3. Organization roles and permission overrides are evaluated in the context of that organization.
4. Facility-level actions additionally require active membership in the selected facility.
5. Global platform support access is explicit, separately audited, and must not be silently inherited by normal tenant users.
6. RLS policies on tenant-owned tables combine the operation permission with organization membership and, where relevant, facility membership.
7. UPDATE policies include both `USING` and `WITH CHECK` tenant predicates so a user cannot move a row into another tenant.
8. SECURITY DEFINER helpers, where truly required, live in a non-exposed schema, have a fixed safe search path, explicit execute grants, and enforce `auth.uid()` plus membership checks internally.
9. Views exposed through the Data API use `security_invoker = true` where supported, or are moved to a protected schema/revoked from client roles.
10. Background jobs and Edge Functions accept tenant identifiers only as untrusted input and independently verify authorization/service scope.

Avoid a global mutable database session variable as the sole tenant boundary. If transaction-local context is used for performance, it must be set only by a trusted server path and must not be independently forgeable by a browser client.

## 5. Safe migration sequence

### Phase A — inventory and baseline

- Export a complete schema-only snapshot from the connected project.
- Enumerate all tenant-bearing and tenant-derived tables, views, RPCs, triggers, Storage buckets/policies, Edge Functions, and scheduled jobs.
- Capture current RLS policies, grants, constraints, indexes, function definitions, and migration ledger.
- Record row counts and orphan/reference-integrity checks without exporting patient-identifying data into development artifacts.
- Verify a full encrypted backup and restore it into a disposable project before any structural migration.

### Phase B — tenant foundation

- Create `organizations` and `organization_memberships` with strict RLS and indexes.
- Provision exactly one initial organization for the existing deployment using an approved operator workflow.
- Add `facilities.organization_id` as nullable only for the transitional migration.
- Backfill every existing facility to the approved initial organization; verify no null or ambiguous rows remain.
- Add and validate the non-null constraint and organization-aware uniqueness/FK constraints.
- Do not automatically convert global admins into members of every future organization.

### Phase C — domain ownership and RLS

- Add tenant ownership to each classified business table using explicit, table-specific backfill rules.
- For facility-derived records, backfill via a verified facility relationship. For organization-level aggregate records, use an explicit approved organization mapping.
- Resolve ambiguous/orphaned records into a review queue; do not guess tenant ownership.
- Add composite tenant-aware foreign keys and indexes.
- Replace permission-only RLS predicates with permission AND organization membership predicates, retaining facility checks for facility-owned records.
- Update every write RPC, view, trigger, import, export, offline sync handler, and Edge Function to preserve tenant ownership.
- Add tenant context to audit events and keep audit records immutable.

### Phase D — application context and UX

- Add an organization switcher populated only from active memberships.
- Keep the active organization in authenticated application state, but revalidate it server-side for every protected request.
- Make all data hooks, query keys, caches, offline queues, reports, exports, and AI context organization-aware.
- Clear or partition cached data on organization switch and sign-out.
- Prevent offline operations from syncing if the user's membership has been suspended or the organization context no longer matches.
- Show the selected organization clearly in the application shell and in exported reports.

### Phase E — verification and rollout

- Run migration replay from an empty database.
- Restore a production backup to a disposable project and run the migration there.
- Test at least two organizations, with one user in both and different roles.
- Prove member reads are scoped to their organization; cross-tenant reads return zero rows.
- Prove cross-tenant inserts, updates, deletes, foreign-key references, RPC calls, exports, Storage reads/writes, and offline sync are rejected.
- Test suspended membership, organization switching, facility membership, global support access, and concurrent writes.
- Compare financial aggregates before/after backfill by organization and insurer, and verify no double counting.
- Only then schedule a reviewed production migration with a verified backup and rollback/recovery plan.

## 6. Minimum acceptance tests

- Organization A member cannot SELECT Organization B rows even with a valid UUID.
- Organization A member cannot INSERT or UPDATE a record referencing Organization B's facility, patient, claim, insurer-owned record, or payment.
- UPDATE cannot change a row's `organization_id` to another organization.
- A user in A and B sees only the currently selected organization and can switch without stale cache leakage.
- Different organization roles for the same user are honored independently.
- A facility member without organization membership is denied.
- A suspended organization or facility membership is denied immediately by server-side authorization.
- Financial reports and outstanding calculations are isolated and reconcile to source rows within each organization.
- Tenant context is present in audit events and cannot be spoofed by the client.
- Anonymous users and untrusted Edge Function callers cannot enumerate organizations or membership records.

## 7. Explicit non-goals and safety boundaries

- Do not rewrite or rename migrations already present in the remote migration ledger.
- Do not run a production schema push or migration repair as part of design approval.
- Do not create tenant records or memberships by guessing from current user accounts.
- Do not treat a successful UI filter, a facility membership check, or RLS being enabled as proof of organization isolation.
- Do not remove indexes based only on an unused-index advisor snapshot.
- Do not make production patient/claims/financial records available to a disposable test environment; use a verified sanitized fixture or controlled restore with access safeguards.

## 8. Current blockers

- The production backup and restore rehearsal are not yet complete.
- The remote migration ledger (74 entries at discovery) differs from the repository migration inventory (116 files); the existing duplicate-version collisions must be reconciled before migration replay can be certified.
- The connected project currently has no organization tables and no organization-level membership model.
- Several core tables use permission-only RLS policies and need organization predicates before multi-tenant operation.
- The initial organization mapping and ownership policy for shared insurer/reference data require explicit operator/product decisions.

**Conclusion:** implement the tenant model only after backup/restore and migration-ledger gates are satisfied. The existing facility model is a useful lower-level boundary, not a substitute for organization tenancy.
