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

- [x] PR #48 online settlement-exception lifecycle: after adding the database contract test, CI (44924895215), CareFlow Quality Gate (44924895202), and Dependency Security Audit (44924895207) passed on head `e4aea3868074ef690eab0059576fe0818110e082`. These are repository checks only; no disposable-database execution has been completed.
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


### Browser console triage — 2026-11-21

The latest user-reported production browser console confirms two release issues:

- **Settlement exception REST 404:** the browser requests `/rest/v1/settlement_exceptions`. The last read-only inspection of Supabase project `jajfdgknctzqypdtvmxo` found `public.claims_settlement_periods`, but not `public.settlement_exceptions` or `public.settlement_exception_audit_events`. This is consistent with PostgREST returning 404 for a relation that is absent from the exposed schema (or not exposed to the Data API). The known schema gap must be resolved through migration-history reconciliation, disposable-database replay and RLS/transaction integration tests, followed by the backup-gated deployment. Do not patch this by creating tables manually in production, disabling RLS, or exposing broader grants. Confirm the Data API schema exposure/grants as part of deployment verification.
- **Favicon 404 at the domain root:** the browser requests `https://kingpumpski.github.io/favicon.ico`, while the repository's Pages app is hosted at `/careflow-hub/`. Main's current `index.html` lacks an explicit favicon link. PR #62 adds `<link rel="icon" href="%BASE_URL%favicon.ico" sizes="any" />`, and the Vite Pages build sets `base: "/careflow-hub/"`. PR #62 remains an unmerged draft at head `cae2e6118cf46701e212292e7888ab35e2e54838`; its passing checks do not change the deployed site. The fix must be merged through the normal review process and Pages redeployed, then verify the browser requests `/careflow-hub/favicon.ico` and receives HTTP 200.
- **Asynchronous message-channel errors:** repeated `A listener indicated an asynchronous response ... message channel closed` messages are not currently tied to a CareFlow source location. Browser extensions commonly emit this class of message. Re-test in a clean Edge profile or with extensions disabled; treat as an application defect only if reproducible there and attributable to a CareFlow listener/message handler.

No production schema, Data API settings, Pages deployment, or other production configuration was changed in response to these console messages.



## Implementation verification update — 2026-11-22

This update supersedes earlier pull-request state descriptions above where they conflict. It records repository changes only; it does not certify live database workflows or replace the backup, migration, security, and operational release gates.

### Merged repository changes

The following pull requests are merged into `main`:

- [x] PR #55 — records the connected Supabase security-advisor findings and cautions against unreviewed RLS, SECURITY DEFINER, or index changes.
- [x] PR #56 — documents the organization-tenancy target model, ownership boundaries, migration phases and acceptance requirements. This is a design document, not tenant isolation implementation.
- [x] PR #58 — strengthens bulk import validation and diagnosis/catalog master-data integrity.
- [x] PR #59 — validates insurance-history imports and prevents conflicting monthly claim/payment writes.
- [x] PR #60 — validates procedure-template costs, duplicate names, imported values and arithmetic.
- [x] PR #62 — fixes the GitHub Pages favicon path using Vite's base URL.
- [x] PR #64 — saves related Settings values through a single upsert request, reports database write errors, and awaits the settings refresh.
- [x] PR #65 — aligns public document/social metadata with the configured Claims Informatics identity and retains the Pages-safe favicon reference.

The implementation PRs above passed their recorded CI, CareFlow Quality Gate and Dependency Security Audit checks before merge. These checks are repository validation; they do not establish that pending database migrations have been applied or that production workflows have passed interactive acceptance testing.

PR #63 was closed as superseded by PR #65. No code from PR #63 was separately merged.

### Remaining database-dependent pull requests

The following work remains unmerged and must not be deployed to production until migration reconciliation, backup/restore verification and disposable-database tests are complete:

- [ ] PR #48 — online settlement exception lifecycle and audit transactions.
- [ ] PR #52 — facility-scoped individual claim-case lifecycle.
- [ ] PR #53 — facility onboarding and membership administration.
- [ ] PR #57 — claim-case financial amount transition integrity.
- [ ] PR #61 — atomic monthly claim/rejection and financial ledger submission.

PR #52 depends on the facility model supplied by PR #53. Review and test the facility foundation first, then the individual claim-case workflow and its financial transition protections. PR #57 overlaps the claim-case lifecycle work and must be reconciled with PR #52 rather than merged as an independent migration without checking the shared migration and schema contracts.

### Still-open operational gates

- [ ] Configure and validate the GitHub `production-backup` environment and Supabase/R2/age secrets without disclosing them in source control or chat.
- [ ] Complete a real encrypted full-system backup and verify its published manifest and R2 read-back checksum.
- [ ] Restore the backup to a separate replacement project and verify PostgreSQL, Auth, Storage, source snapshot, login, RLS and Edge Functions.
- [ ] Reconcile the production migration ledger against all repository migrations and resolve the three duplicate timestamp groups without rewriting applied migration history.
- [ ] Run database contract and transaction tests for PRs #48, #52, #53, #57 and #61 against a disposable database.
- [ ] Review the five SECURITY DEFINER RPC findings individually, confirm the intended `role_permissions` access model, and enable leaked-password protection through the appropriate Auth configuration.
- [ ] Complete organization-level tenancy implementation and cross-tenant RLS tests; the merged PR #56 is design documentation only.
- [ ] Verify a legitimate first administrator and facility bootstrap path without assuming the last recorded zero-facility state has changed.
- [ ] Run current Pages deployment and interactive application acceptance tests after the latest merged commits, including large-table performance and offline/online transitions.

No production schema, data, migration ledger, RLS policy, database grant, Auth setting, index, or Supabase deployment was changed by the repository merges recorded in this update. The no-paid-Supabase-branch restriction remains in force.


### Fresh read-only production snapshot — 2026-11-22

A new read-only inspection of Supabase project `jajfdgknctzqypdtvmxo` confirmed:

- Project status: `ACTIVE_HEALTHY`; PostgreSQL 17.11; region `eu-west-1`.
- Production migration ledger: 74 rows.
- `public.facilities` and `public.facility_memberships` exist, but the facility count is 0 and active membership count is 0.
- `public.claim_cases` is absent.
- `public.settlement_exceptions` and `public.settlement_exception_audit_events` are absent.
- The security advisor still reports one RLS-enabled table without a policy (`public.role_permissions`), five authenticated-callable SECURITY DEFINER functions, and leaked-password protection disabled.

The observed table state confirms that the facility foundation is present but has not been bootstrapped with a facility or active member. It also confirms that individual claim cases and settlement exception tables are not deployed. These are observations only; no production data, schema, grants, policies or Auth settings were changed.


## Implementation verification update — 2026-11-22 (follow-up)

### Hybrid authentication startup hardening

- [x] PR #67 merged: hybrid mode no longer treats unknown Supabase reachability during an online startup as permission to create a synthetic offline administrator session.
- [x] The app now waits on the real Supabase session path while an online reachability probe is pending, enters offline mode after a confirmed failure, and probes again when the browser returns online.
- [x] Unit tests cover explicit mode configuration, pending reachability, offline fallback and successful recovery.
- [x] CI, CareFlow Quality Gate and Dependency Security Audit passed on PR head `99caa58cd11b3880b4c14d429cc3651d31c6b177` before merge.
- [ ] Shared-workstation and intentionally configured offline-mode access still require a broader security review. This fix narrows transient startup exposure; it does not certify all local IndexedDB data access boundaries.

### Monthly claim/rejection permission boundary

PR #61 remains a draft and is not merged. Its implementation was revised after a read-only review of the live role-permission matrix showed that claims officers and data-entry officers have `claims.write`, but not general `payments.write` or `ledger.write` permissions. The earlier three-permission requirement would therefore have excluded those intended claims roles from monthly aggregate submission.

The revised PR now:

- Adds a dedicated `claims.submit_monthly` permission for superusers, administrators, claims officers and data-entry officers.
- Keeps claims officers and data-entry officers without general payment or ledger write access.
- Keeps the exposed public RPC wrappers `SECURITY INVOKER` and delegates only the fixed system-generated financial postings to private `security_internal` `SECURITY DEFINER` helpers.
- Checks `auth.uid()`, `claims.write` and `claims.submit_monthly` inside those private helpers, and validates that the insurer is active.
- Adds unit tests for the role permission boundary and a SQL contract test for helper security, wrapper grants and role assignments.

The updated PR head `0e50bd6da2ee35a87d36a6396bef9a87eda6ccc0` passed CI, CareFlow Quality Gate and Dependency Security Audit. Its SQL contract test has not been executed against a disposable Supabase database, and the transactional commit/rollback behavior has not been integration-tested. Keep PR #61 in draft until those tests and migration-history gates are satisfied.

### Claim-case migration follow-up ordering

PR #57 is now explicitly stacked on PR #52 because both touch the same individual claim-case migration file `20261120170000_individual_claim_case_lifecycle.sql`. Its amount-transition correction must be incorporated into the PR #52 feature branch before that migration is applied anywhere. Do not merge or deploy PR #57 as an independent migration after PR #52's migration has been applied.

### Current live database status

The 2026-11-22 read-only inspection confirmed:

- Supabase project `jajfdgknctzqypdtvmxo` is `ACTIVE_HEALTHY`, PostgreSQL 17.11 in `eu-west-1`.
- The production migration ledger has 74 rows.
- `public.facilities` and `public.facility_memberships` exist, but there are zero facilities and zero active memberships.
- `public.claim_cases`, `public.settlement_exceptions` and `public.settlement_exception_audit_events` do not exist.
- The security advisor still reports the RLS-enabled `public.role_permissions` table without a client policy, five authenticated-callable SECURITY DEFINER functions and disabled leaked-password protection.

These are read-only observations. No production database migrations, RLS changes, grants, Auth settings or data changes were performed.


### Latest main deployment verification — 2026-11-22

After PR #67 merged, main commit `fa947c424a166fed461b0edc9d2d8359a3a2c7c7` completed all repository push checks successfully:

- CI run 44987168218 — passed (migration filename integrity, TypeScript, lint, tests, backup/recovery tests, script syntax and production build).
- CareFlow Quality Gate run 44987168216 — passed (TypeScript, lint, unit tests, backup tests, Edge Function typecheck and production build).
- Dependency Security Audit run 44987168187 — passed.
- GitHub Pages deployment run 44987168182 — build, SPA fallback, deploy and published-site/assets smoke test all passed.

This confirms the repository and static-site release pipeline for that exact main commit. It does not prove interactive browser behavior on every route or certify the pending Supabase database workflows.


## Current release candidate status — 2026-11-22 (latest)

This section supersedes earlier open-PR descriptions in this document.

### Merged repository changes
- PR #69: backup workflow now reports all missing configuration variable names safely and validates the approved project, PostgreSQL URI and TLS requirement. It does not create or configure secrets.
- PR #70: publishes the read-only 74-row production migration ledger and 116-file repository inventory, including the normalized-name comparison and all three duplicate timestamp groups.
- PR #67: hybrid authentication startup no longer creates a synthetic offline administrator while an online Supabase reachability probe is pending.
- PRs #55, #56, #58, #59, #60, #62, #64, #65, #66 and #68 remain merged as recorded in the earlier updates.

### Consolidated open database-dependent release candidates

- **PR #48 — settlement exception lifecycle.** Refactored to public SECURITY INVOKER wrappers and private `security_internal` SECURITY DEFINER helpers; requires payments permission and facility access; detection time is now server-generated. Repository checks are running. The base table migration `20260908150000_settlement_exception_register.sql` is not in the live production ledger, and the settlement exception tables are absent. Disposable-database tests remain mandatory.
- **PR #61 — atomic monthly claims and rejections.** Uses a dedicated `claims.submit_monthly` permission for claims and data-entry roles without granting general `payments.write` or `ledger.write`. CI, CareFlow Quality Gate and Dependency Security Audit passed on the current recorded head. Its SQL contract test and transaction commit/rollback behavior have not been run against a disposable database. The PR remains draft.
- **PR #72 — facility onboarding and individual claim cases.** Consolidates the former PRs #52, #53 and #57 into two ordered migrations: `20261120170000_individual_claim_case_lifecycle.sql` and `20261120173000_facility_admin_onboarding.sql`. It includes first-owner bootstrap, last-owner concurrency protection, facility-scoped claim cases, immutable case events, amount-transition guards, private mutation helpers and public invoker wrappers. CareFlow Quality Gate and Dependency Security Audit passed on the current recorded head; CI is still pending. SQL contract tests have not been executed against a disposable database.
- **PR #23 — RAP.** Remains isolated and disabled by default; it is not part of this release.

PRs #52, #53, #57 and #71 were closed as superseded by consolidated PR #72. No code from those PRs was separately merged.

### Latest main deployment verification

Main commit `ebe2f9165d33006b803b9993850f2ed1f6aa245d` passed CI, CareFlow Quality Gate and Dependency Security Audit. GitHub Pages deployment run `44987762702` completed the production build, SPA fallback verification, deployment and published-site/assets smoke test successfully.

This confirms the static-site release pipeline for that exact main commit. It does not replace interactive browser acceptance tests for all routes or database integration tests.

### Backup and recovery remains blocked

The last observed scheduled full-system backup run, `44888297258`, failed during configuration verification before age installation or backup generation. No archive or verified manifest was produced. PR #69 improves the next preflight's diagnostics, but the required GitHub `production-backup` environment secrets, private R2 bucket credentials and offline age key must still be configured and verified by the project owner. A successful encrypted backup and a replacement-project restore rehearsal remain mandatory.

### Production restrictions

- No production database migration or ledger repair has been performed.
- No production RLS, grants, indexes, Auth settings or data have been changed.
- No paid Supabase branch or replacement project has been created.
- The 74-row/116-file migration reconciliation, three duplicate timestamp groups, backup/restore gate and disposable-database integration tests remain release blockers.
