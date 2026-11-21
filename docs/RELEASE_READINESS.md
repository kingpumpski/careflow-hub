# CareFlow Hub — Release Readiness

## Release policy

`development` is the integration branch. `main` is the production branch. Production changes must pass the automated quality and security gates before merge.

## Application gates

- [x] TypeScript check passes.
- [x] ESLint regression gate passes; main has 719 warnings (0 errors), down from the 720-warning baseline, with no new warning signatures. The remaining warnings are tracked for incremental cleanup.
- [x] Unit/regression tests pass.
- [x] Production build completes successfully.
- [x] Claims financial UI reads the authoritative `claims_outstanding_periods` view.
- [x] Outstanding balances use the canonical formula: `max(0, submitted - rejected - payments - withholding_tax)`.
- [x] Financial analytics use authoritative period data and distinguish actual vs provisional settlement.
- [x] Provisional WHT estimates do not count as proof of actual WHT settlement.
- [x] No client-side service-role or privileged Supabase credentials exist.
- [x] Document intake requires human review before database commit.
- [x] Offline operations remain available where supported and synchronize through the durable queue when connectivity returns.

## Database gates

- [x] Schema changes are represented by versioned files under `supabase/migrations/`.
- [x] RLS policies are enabled for application tables and reviewed for the affected role boundary.
- [x] New privileged operations are protected by authenticated Edge Functions and explicit role checks.
- [x] Calculated financial views remain `security_invoker` where appropriate.
- [x] WHT rows distinguish calculated/provisional amounts from confirmed actual settlement (`is_actual`).
- [x] WHT updates use the existing `payments.write` permission boundary.
- [x] Production data changes are performed through application workflows or controlled SQL/migration procedures.
- [ ] A rollback/recovery approach is documented for destructive schema changes.
- [ ] Duplicate migration version prefixes are reconciled against the production migration ledger; see [Migration version reconciliation](MIGRATION_RECONCILIATION.md).
- [ ] Organization-level tenant schema, active-organization context and cross-tenant RLS tests are implemented (facility scoping alone is not organization tenancy).
- [ ] Claim lifecycle transitions are enforced by a server-side transactional RPC and Claims UI.
- [ ] Settlement exception register supports atomic online/offline lifecycle transitions and audit. PR #48 contains the online implementation and passed code CI, but remains draft pending disposable-database integration tests; its migration is not applied.

## Security gates

- [x] Dependency audit passes (main run 44720017229 on 2026-11-20: 0 production and 0 full-tree vulnerabilities; audit gates now block pull requests).
- [x] Edge Function authentication and origin controls pass.
- [x] Sensitive secrets exist only in server-side configuration.
- [x] Admin/self-role escalation protections are verified.
- [x] Audit logging exists for privileged or financially material actions.
- [x] Import/transcription inputs enforce size and type boundaries.

## Latest connected-project advisor snapshot (2026-11-21 15:05 UTC)

The live Supabase security advisor reported the following findings for project `jajfdgknctzqypdtvmxo`:

- **One RLS configuration finding (INFO):** `public.role_permissions` has RLS enabled but no policies. This table must be reviewed against the intended permission lookup model before adding a policy; do not grant broad client reads as a shortcut.
- **Five SECURITY DEFINER RPCs (WARN):** authenticated users can execute `public.current_user_has_any_role(public.app_role[])`, `public.current_user_has_permission(text)`, `public.finalize_preauthorization_handoff(...)`, `public.get_my_permissions()`, and `public.user_has_facility_access(uuid)`. Each function's caller contract, internal authorization checks, search path, and required execute grants must be reviewed individually. Some authenticated RPCs may be intentional; the advisor finding alone does not prove exploitability. Preserve required application workflows while removing unintended exposure.
- **Leaked-password protection (WARN):** Supabase Auth's compromised-password protection is disabled. Enable it through the Auth configuration after confirming the intended user-facing policy and communicating any sign-in/password-change impact.

The performance advisor also reported **76 unused-index INFO findings** at the same observation time. Treat these as workload-dependent review candidates only: low traffic, newly added indexes, and infrequently used operational paths can all appear unused. Do not drop indexes solely from this snapshot; validate query plans and representative workload first.

These are live-project observations, not code-level fixes. No database permissions, policies, Auth settings, indexes, or migrations were changed by this audit. Re-run advisors after remediation and record the resulting clean or explicitly accepted findings.

## Backup and recovery gates

- [x] Full-system Backup Center, scheduled/on-demand worker, encrypted off-site archive flow, manifest and checksum verification, and Storage restore tooling are implemented in source (PR #42).
- [x] Full custom-format PostgreSQL dump includes and validates Auth users/identities, Storage metadata and migration history; database and Storage restore scripts are guarded by target confirmation (PR #45).
- [x] Backup integrity tests, Node/Bash syntax checks and Deno Edge Function typecheck pass (PR #45 checks 44729717302 and 44729717264).
- [x] Production database deployment workflow now requires a fresh successful encrypted backup before migrations can run.
- [x] Supabase project `jajfdgknctzqypdtvmxo` is accessible and `ACTIVE_HEALTHY` (PostgreSQL 17, `eu-west-1`).
- [x] Private Cloudflare R2 bucket `careflow-system-backups` exists and the authenticated `backup-control` Edge Function is deployed and ACTIVE.
- [ ] Bucket-scoped worker/portal credentials, age encryption key, GitHub `production-backup` secrets and Supabase function secrets are configured. Do not place secret values in chat.
- [ ] First encrypted full-system backup completes and its manifest verifies.
- [ ] Restore rehearsal succeeds against a disposable replacement Supabase project, including database, Auth, Storage objects, Edge Functions and login/RLS smoke tests.

## Deployment gates

- [x] GitHub Actions CI passes on `development`.
- [x] Pull request to `main` passes the current full quality/security checks.
- [x] GitHub Pages build includes the SPA `404.html` fallback.
- [x] Pages deployment workflow is configured with the required Pages permissions and artifact/deploy actions.
- [x] HTTPS live smoke test passes after deployment; root, same-origin JS/CSS assets and SPA deep-link fallback are verified (main run 44727328070).
- [x] HTTP redirects to HTTPS; verified by main Pages run 44727328070 on 2026-11-20.
- [x] Supabase production project is accessible and healthy; confirmed project ref is `jajfdgknctzqypdtvmxo` (PostgreSQL 17, `eu-west-1`). No production migrations are authorized or applied by this verification.
- [ ] The production migration ledger is reconciled with the repository migration files and a restored backup passes a migration replay test.
- [ ] The `production-database` GitHub Environment has required reviewers and environment-scoped Supabase secrets configured.

> **Deployment boundary:** repository implementation and CI validation continue while production Supabase deployment is intentionally deferred. The application must not claim that pending migrations or Edge Functions are live until the controlled deployment workflow succeeds.

## Operational smoke test

After every production release:

1. Open the production application.
2. Sign in with a legitimate authorized account.
3. Confirm dashboard KPIs render.
4. Confirm online/offline status indicator behaves correctly.
5. Open Claims and verify claim/payment/WHT data.
6. Open Outstanding and confirm period status and calculated balances.
7. Open Advanced Analytics and verify filters update the visualizations.
8. Open Document Intake and verify review-before-commit behavior.
9. Verify an authorized admin can access user management.
10. Verify an unauthorized role cannot access privileged administration.

## Database update procedure

For schema changes, create a new timestamped migration in `supabase/migrations/`, test it against the intended Supabase environment, review RLS/index/function impact, then apply it through the controlled deployment process.

For normal records, use CareFlow's application workflows. Direct Table Editor changes should be limited to controlled administrative corrections and must preserve the same business rules used by the application.

## Current release gate

The repository is not production-certified. Main-branch CI, the quality gate and dependency security audit passed on 2026-11-20; the latest dependency audit reports zero vulnerabilities. PR #49 merged a per-file/rule/message ESLint regression gate, and PR #50 removed one warning; the current observed count is 719 warnings against a 720-warning baseline. The last verified GitHub Pages HTTPS smoke test and HTTP-to-HTTPS redirect were recorded in run 44727328070; the newest merged commit still needs a fresh live smoke test. Supabase project `jajfdgknctzqypdtvmxo` is accessible and ACTIVE_HEALTHY, Cloudflare R2 is enabled with private bucket `careflow-system-backups`, and `backup-control` is deployed. However, no worker/portal credentials or encryption key have been configured, no encrypted backup has completed, and no restore rehearsal has passed. The live migration ledger currently contains 74 entries while the repository has 116 local migration files and three duplicate timestamp groups; do not infer that the difference is simply unapplied migrations. No production schema migration or ledger repair has been performed. Organization-level tenant isolation, server-enforced claim lifecycle, settlement exception database integration, and first legitimate administrator bootstrap remain unverified. The connected project also has unresolved security-advisor findings: five authenticated-callable SECURITY DEFINER functions, an RLS-enabled `role_permissions` table without a client policy, and leaked-password protection disabled. Do not interpret a successful static-site deployment as proof that every backend workflow is live.

## Implementation verification update — 2026-11-21

This section records the latest implementation and live-schema checks. It does not supersede the deployment gates above.

### Verified pull-request implementation status

- [x] PR #48 online settlement-exception lifecycle: CI, CareFlow Quality Gate, and Dependency Security Audit passed on head `3f72ecedbfe41357112886111c5d2a500fc5542d` (runs 44890716793, 44890716802, 44890716783). These are repository checks only; no disposable-database execution has been completed.
- [x] PR #61 atomic monthly claim and rejection submission: CI, CareFlow Quality Gate, and Dependency Security Audit passed on head `aed5b08d04d3156e3d943e039922203f888edd82` (runs 44923023928, 44923023923, 44923023985). SQL/RLS integration testing remains outstanding.
- [x] PR #62 GitHub Pages favicon base-path correction: CI, CareFlow Quality Gate, and Dependency Security Audit passed on head `cae2e6118cf46701e212292e7888ab35e2e54838` (runs 44923920293, 44923920288, 44923920289).
- [ ] These pull requests remain unmerged drafts. Passing checks do not mean their changes are present in production.

### Settlement exception live-schema gap

A fresh read-only inspection of the connected Supabase project found `public.claims_settlement_periods`, but did not find `public.settlement_exceptions` or `public.settlement_exception_audit_events`. The repository contains the base table migration `20260908150000_settlement_exception_register.sql`; PR #48 adds the online atomic lifecycle RPC migration `20261120160000_settlement_exception_atomic_lifecycle.sql`.

The online register therefore remains unavailable against the inspected live schema until the migration sequence is reconciled, replayed and tested in a disposable database, then deployed through the approved backup-gated release process. Do not apply either migration directly to production as an ad hoc repair. The remote migration ledger currently reports 74 entries; its normalized version values mean that a missing original filename timestamp alone is not proof of drift. Reconcile by comparing migration names, schema state and repository history together.

### Remaining release blockers

- [ ] Disposable Supabase integration tests for settlement-exception permissions, facility isolation, idempotent detection, status transitions and immutable audit events.
- [ ] Disposable Supabase integration tests for PR #61 monthly claim/rejection RPC atomicity, financial invariants and RLS/grants.
- [ ] Full migration-history reconciliation (remote ledger: 74 entries; repository inventory: 116 migration files; duplicate timestamp groups remain documented).
- [ ] First encrypted full-system backup and verified restore rehearsal.
- [ ] Organization-tenancy foundation and data-ownership implementation, after approved initial organization mapping and backup/migration gates.
- [ ] End-to-end acceptance testing across claims, pre-authorizations, settlement, accounting, offline synchronization, permissions and reporting.
- [ ] Re-run live security advisors after remediation; review the five SECURITY DEFINER findings and role_permissions RLS policy gap, and enable leaked-password protection after confirming the intended auth policy.

No production database schema, data, migration ledger, Auth configuration, grants, policies or indexes were changed during this verification. The 76 unused-index notices remain informational and must not trigger index removal without workload evidence.

### Facility onboarding and individual claim-case prerequisites

- PR #53 (`feat/admin-facility-onboarding`) adds administrator-only facility onboarding and member-management RPCs. Its CI, CareFlow Quality Gate and Dependency Security Audit passed on the recorded head. The included `supabase/tests/facility_admin_onboarding.test.sql` is a read-only privilege/schema contract test and still must be run with `supabase test db` against a disposable project.
- PR #52 (`feat/individual-claim-case-lifecycle`) keeps the insurer-level monthly aggregate `claims` model separate from facility-scoped individual claim cases and immutable case events. Its CI, CareFlow Quality Gate and Dependency Security Audit passed on the recorded head. The included `supabase/tests/individual_claim_case_lifecycle.test.sql` is a schema/security contract test and still must be run against a disposable database.
- At the last recorded connected-project check, there were zero facilities and zero active facility memberships. Consequently, facility onboarding/bootstrap is a real operational prerequisite for testing and enabling individual claim cases and other facility-scoped workflows. No facility or membership was provisioned by this work.

### Settlement exception SQL contract test added

A read-only database contract test, `supabase/tests/settlement_exception_lifecycle.test.sql`, was added to the PR #48 branch at commit `e4aea3868074ef690eab0059576fe0818110e082`. It checks table presence, RLS enablement, authenticated read-only grants, anonymous RPC denial, authenticated RPC grants, SECURITY DEFINER/search-path configuration, facility SELECT policies, immutable audit trigger presence, and the active-exception uniqueness index. This improves regression coverage but does not prove row-level isolation or execute lifecycle transactions. PR #48's new head checks are pending; run this SQL test against a disposable database after the migration sequence is reconciled.

### Backup readiness detail

The backup runbook defines the required GitHub Environment secrets, age encryption recipient, private R2 credentials, Supabase database connection and Edge Function secrets. The current release-readiness record confirms these credentials/key are not yet configured, no encrypted backup has completed, and no restore rehearsal has passed. Treat this as an operational configuration gate, not a code-only task.
