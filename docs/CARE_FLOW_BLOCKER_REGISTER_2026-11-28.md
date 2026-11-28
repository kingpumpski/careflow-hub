# CareFlow Hub — consolidated blocker register

**Snapshot:** 2026-11-28  
**Repository:** `kingpumpski/careflow-hub`  
**Production Supabase project:** `jajfdgknctzqypdtvmxo`  
**Main commit at snapshot:** `296af07ff08626f74d7975d112beaa9778a53608`  
**Current main commit at this update:** `42b0f5c0f23bf47acc878042b20aa976122c9a2a`

This register is the current release-control view. A source-code fix, passing CI, or successful GitHub Pages deployment does not clear a production database blocker. A blocker is closed only after the relevant production contract is deployed and verified.

## Release blockers

| ID | Area | Status | Evidence / impact | Required closure evidence |
|---|---|---|---|---|
| CF-DB-01 | Migration history and source provenance | **BLOCKED** | Production ledger has 74 rows and ends at `20260921160938`; repository has 146 SQL migrations, 56 unique direct name matches, 18 ledger rows without unique direct source matches, 90 source files without direct ledger-name matches, 32 later-version candidates and 3 duplicate timestamp groups. | Recover authoritative deployed SQL bundle; checksum and crosswalk all ledger rows and candidates; resolve duplicate versions from provenance; rehearse full forward-only sequence on restored production copy. |
| CF-PREAUTH-01 | Prepared-document handoff | **BLOCKED** | `preauthorization_submissions` is missing. Legacy `preauth_submissions` is an insurer execution queue and must not be reused. Live private finalizer references legacy `preauth_submissions` and misspelled `pre_auth_submissions`; public wrapper remains SECURITY DEFINER. | Apply and verify canonical prepared-only table and corrected private finalizer; wrapper SECURITY INVOKER with empty search_path; authenticated execute only; prove prepared handoff does not submit to insurer. |
| CF-CASE-01 | Individual claim-case lifecycle | **BLOCKED** | `claim_cases` and `claim_case_events` are missing. | Rehearsed migrations, facility-scoped RLS, atomic transition tests, audit coverage, REST/RPC verification. |
| CF-SET-01 | Settlement exception lifecycle | **BLOCKED** | `settlement_exceptions` and `settlement_exception_audit_events` are missing. | Rehearsed lifecycle migration, scoped permission tests, atomic state transition and audit-event verification. |
| CF-SET-02 | Remittance and receipt-month reporting | **BLOCKED** | `claims_settlement_remittances` and `claims_settlement_receipt_months` are missing; `claims_settlement_periods` lacks `approved_gross_amount` and `actual_receipt_date`. | Reconcile migration history; deploy remittance/reversal logic and receipt-month view; verify idempotency, reversal exclusion, month matching and REST responses. |
| CF-SET-03 | Claims settlement authorization | **BLOCKED** | `claims.settlement.read/write` permission keys and role grants are absent in the live legacy permission catalogue. | Apply compatible permission migration; verify claims-officer and accounts-officer access using actual production role identities and RLS. |
| CF-FAC-01 | Facility administration | **BLOCKED** | Base `facilities` and `facility_memberships` tables exist; onboarding/member/WHT RPCs are absent. Existing facility and membership tables currently have no seeded records. | Rehearse RPCs and RLS; verify create-owner, add-member, deactivate-member and facility WHT rate authorization before enabling the feature flag. |
| CF-NOTIFY-01 | Notification fan-out | **BLOCKED** | `notifications` table exists with the older minimal shape; notification fan-out triggers are not deployed. Recipient-scoped read/update isolation and audit-log read protection pass. | Apply the reconciled notification migration; verify idempotent fan-out, recipient isolation, audit redaction and event routing before enabling notifications. |
| CF-REPORT-01 | Report letterhead settings RPC | **BLOCKED** | `get_report_letterhead_settings()` is absent in production. Source hook is capability-gated and does not grant ordinary readers broad `system_settings` access. | Deploy and verify allowlisted RPC, SECURITY INVOKER wrapper, permission checks and report PDF output before enabling letterhead flag. |
| CF-REPORT-02 | Claims-cycle settlement reconciliation report | **MERGED — SOURCE ONLY** | Merged in PR #143 at `8c62f9710b7fa4c9bae47c1a4927496306ccf14e`. The report matches advice to the original claim cycle, separates provisional/actual WHT and keeps missing approved gross/receipt dates unknown. Production approved-gross/receipt-date fields and remittance objects remain unreleased. | After the migration provenance and restored-copy gates pass, release the approved gross/receipt-date and remittance schema, verify reconciliation against real insurer advice, then enable any associated capabilities. |
| CF-REPORT-03 | Operational performance reporting | **MERGED — SOURCE ONLY** | Merged in PR #144 at `42b0f5c0f23bf47acc878042b20aa976122c9a2a`. The report covers rejection reasons, insurer performance, settlement delays, outstanding follow-up and audit-based staff claims activity. It prioritizes claims-cycle aggregates, preserves unknown balances, and gates claim/audit sections by their existing permissions. | Verify the deployed report against newly recorded settlement cycles as facilities begin using it. Keep staff activity labelled as audit events, not assigned workload. Production schema and data release blockers remain separate. |
| CF-DIAG-01 | Claim diagnosis draft persistence | **BLOCKED** | `claim_diagnosis_drafts` is missing. | Deploy facility-scoped RLS and persistence RPC/table; verify save/reload isolation and keep feature disabled until confirmed. |
| CF-SEC-01 | Security review | **REVIEW REQUIRED** | Existing authenticated-callable SECURITY DEFINER functions, deny-by-default `role_permissions` RLS, and disabled leaked-password protection need evidence-based review. | Review function callers/policies; do not revoke helpers blindly or add broad permission-catalog policies; test password policy and recovery before changing Auth settings. |
| CF-OPS-01 | Backup and restore prerequisite | **BLOCKED — DEVELOPMENT PAUSED** | Backup development remains explicitly on hold. A verified encrypted backup and restore rehearsal are still mandatory before production schema changes. | Keep backup feature work paused; before production release, obtain a verified backup and complete a disposable restore rehearsal. Do not merge backup PR #128 to bypass this gate. |

## Reports components

The source Reports page now has these report areas:

1. Account Balance — submitted, rejected, net claim, paid, WHT applied and outstanding.
2. Income Statement — revenue, adjustments, WHT expense and net income.
3. Outstanding Receivables — balances and collection ratio.
4. Tax Liability — tax base/rate with separate provisional WHT, actual WHT and WHT applied.
5. Claim Aging — outstanding by age bucket.
6. Cash Receipts by Month — cash grouped by insurer and recorded payment month.
7. Settlement Reconciliation — merged in PR #143; matches advice to the original submitted month and separates submitted gross, approved gross, rejected amount, provisional WHT, actual WHT, cash received, approval variance and approved-but-unpaid balance. Missing values remain unknown, not zero.
8. Operational Performance — merged in PR #144; rejection reasons, insurer performance, settlement delays, outstanding follow-up and audit-based staff claims activity. Staff activity is not treated as assigned workload or hours worked.

The report screen now includes approved gross and approval variance in the account-balance table when insurer advice is available. The cash-receipts report is derived from the existing `payments` table and remains available independently of the missing remittance ledger/view. It does not treat payment month as the claims cycle and does not infer actual-WHT receipt date. PDF, Excel and print paths were merged in PR #141 as commit `53dbcb4e53a88b0373b8b694b2ba46dd5bedda02`. CI, quality, dependency audit and disposable PostgreSQL migration replay passed on the exact PR head; the merge-commit GitHub Pages deployment and published-site smoke test also passed.

**Frontend report work is not a substitute for the database release.** The new cash receipts view can operate against the existing payments table; settlement-dependent totals continue to fail closed rather than presenting missing data as zero.

## Feature flag policy

Keep all optional database capabilities disabled until their own production objects, grants, RLS and behavior are verified:

- `CARE_FLOW_FACILITY_ADMIN_ENABLED`
- `CARE_FLOW_NOTIFICATION_EVENTS_ENABLED`
- `CARE_FLOW_DOCUMENT_LETTERHEAD_ENABLED`
- `CARE_FLOW_CLAIM_DIAGNOSIS_DRAFTS_ENABLED`
- `CARE_FLOW_SETTLEMENT_EXCEPTIONS_ENABLED`
- `CARE_FLOW_SETTLEMENT_REMITTANCES_ENABLED`
- `VITE_CAREFLOW_PREAUTH_HANDOFF_ENABLED` (build-time equivalent)

## Change and data safety

- Do not create a paid Supabase branch or project.
- Do not run production migrations, DDL, data writes, grants, Auth changes or Edge Function deployments until CF-DB-01 and CF-OPS-01 have passed.
- Do not create test facilities or seed organisation records before facility RPC/RLS verification.
- Preserve all existing facility and claims records.
- Keep the backup feature implementation paused.
- Do not change the prepared-document/insurer-submission boundary.
- Do not mark migration versions applied based on filenames, approximate names or disposable test normalization.


## Fresh production recheck — 2026-11-28 09:17 UTC

The Supabase migration API was queried again. It still returns 74 migration records, with latest version `20260921160938` (`fix_facility_policy_recursion_runtime`). The repository tree still contains 146 SQL migrations and the three duplicate timestamp groups remain:
- `20260907140000`: `preauth_atomic_hardening`, `preauth_versions_workflow_hardening`
- `20260907144000`: `preauth_document_integrity`, `preauth_document_lifecycle`
- `20260907145000`: `preauth_audit_events`, `preauth_workflow_transitions`

A fresh read-only catalog check reconfirmed that `preauthorization_submissions`, claim-case tables, settlement-exception tables, remittance ledger, receipt-month view and diagnosis-draft table are missing. `claims_settlement_periods` exists with RLS enabled, but it still lacks `approved_gross_amount` and `actual_receipt_date`. The `claims_outstanding_periods` view exists. The live permission catalogue still has no `claims.settlement.read/write` keys. The live finalizer wrapper remains SECURITY DEFINER with an empty search path.

The latest security-advisor read at 09:17 UTC reports the same three categories: one RLS-enabled/no-policy informational finding (`role_permissions`, deny-by-default), five authenticated-callable SECURITY DEFINER functions, and leaked-password protection disabled. No policy, function grant, Auth setting or production object was changed by this inspection.

The new Settlement Reconciliation report is source-only in the current PR. It reads the existing `claims_settlement_periods` table and keeps approved-gross calculations unknown where that historical column is absent. It does not depend on the missing remittance table or view.


## Operational report source row counts — 2026-11-28 (read-only)

A fresh count-only query against production returned:
- `claims`: 1 row
- `insurance_companies`: 14 rows
- `payments`: 1 row
- `claims_settlement_periods`: 0 rows
- `claims_outstanding_periods`: 1 row
- `audit_logs`: 26 rows (one recorded claim insert event at the time of inspection)
- `profiles`: 1 row

The new operational reports may therefore show sparse tables or empty settlement-cycle sections in the current production environment. That is a data-availability fact, not a calculation failure. No facility, claim, payment, audit or profile records were created or changed.


## Report implementation merge — 2026-11-28

PR #144 merged as `42b0f5c0f23bf47acc878042b20aa976122c9a2a`. The operational report includes rejection analysis, insurer performance, settlement delay, outstanding follow-up and audit-based staff claims activity. The report uses only existing read sources and existing `claims.read` / `audit.read` permission boundaries. It adds no production migration, grants, feature flags or data writes.

The production source inventory at the time of implementation was sparse: 1 claim, 14 insurers, 1 payment, 0 claims-settlement-period rows, 1 outstanding-period view row, 26 audit-log rows and 1 profile. Empty report sections are expected until source records exist; they are not represented as invented zero-value settlement cycles.


## Fresh read-only production recheck — 2026-11-28 14:06 UTC

The connected project `jajfdgknctzqypdtvmxo` is `ACTIVE_HEALTHY` (PostgreSQL 17.11). The migration API still reports **74 applied migration records**, latest version `20260921160938`. The repository migration chain is not reconciled with that ledger; CF-DB-01 remains blocked.

A read-only catalog check reconfirmed:
- Present: `claims_settlement_periods` and `claims_outstanding_periods`.
- Missing: `claims_settlement_receipt_months`, `claims_settlement_remittances`, `settlement_exceptions`, `settlement_exception_audit_events`, `claim_cases`, `claim_case_events`, `claim_diagnosis_drafts`, and `preauthorization_submissions`.
- `claims_settlement_periods` still lacks `approved_gross_amount` and `actual_receipt_date`; the existing columns include submitted total, provisional/actual WHT, payment received, rejection, advice reference/date and settlement status.
- Current row counts are sparse/empty: `claims` 0, `insurance_companies` 0, `payments` 0, `withholding_tax` 0, `ledger_entries` 0, `claims_settlement_periods` 0, `profiles` 0, `facilities` 0. The catalog also reports two audit-log rows and one row each in `procedures`, `diagnosis_codes` and `system_settings`.

The current security-advisor snapshot reports one informational deny-by-default RLS finding on `role_permissions`, five authenticated-callable SECURITY DEFINER functions requiring function-by-function review, and disabled leaked-password protection. No policies, function grants, Auth settings, database objects or records were changed during this read-only check.

## Statement of Account WHT presentation — 2026-11-28

PR #146 merged as `1f5f89e2bd4641b18c9767cdf848284df59867d9`. The company statement now displays each claims month's effective WHT as a separate credit line against Accounts Receivable, includes historical WHT credits in the brought-forward balance, and uses actual WHT in place of provisional WHT once advice is confirmed. It avoids duplicating WHT already credited to Accounts Receivable. The PDF explanation and statement calculation tests were updated. This is a statement presentation/allocation only; it does not create a second general-ledger posting or change production schema. Live-data verification remains pending because the connected production claims, insurer, payment, WHT and settlement-period tables currently have zero rows.

PR #128 remains open and unmerged because backup development is paused and the restoration safety gate is not complete. No production migration, DDL, grant, Auth change or data write was performed.

## Implementation tranche — insurer-paid WHT, statements, reports and document UX

The following changes are implemented on branch `feat/wht-certificates-and-document-workflows` and await automated verification/release:

- **Insurer-paid WHT certificates:** additive table and restricted RPC record certificate reference/date/received date/amount against confirmed monthly actual WHT. On the first certificate, the provisional Dr WHT Expense / Cr WHT Payable estimate is reversed once. Each certificate posts Dr Withholding Tax Receivable / Cr Accounts Receivable; no cash/bank posting is created. Receipt rows and related WHT journals are append-only. The UI is protected by `VITE_CAREFLOW_WHT_CERTIFICATE_RECEIPTS_ENABLED`, which remains disabled until the database release gate is passed.
- **WHT rate source:** a facility-scoped read RPC now prefers the facility rate and falls back to the global `withholding_tax_rate` saved on the Settings page. Settlement capture displays the approved rate read-only and automatically applies it; the user does not type a tax amount/rate into the settlement form.
- **Statement of Account:** removed the separate Claims & WHT Reconciliation panel from both screen and PDF. The statement is selected-company-only, fetches every ledger page, includes brought-forward balance and all selected-period Accounts Receivable transactions, and recognises WHT as a distinct credit only from the certificate-backed ledger posting. PDF generation opens a review preview before print/save.
- **Claims Schedule:** removed the Claims count column; renamed Period to Claims Period; added confirmed WHT; outstanding now equals submitted (excluding rejected claims) less cash paid less confirmed actual WHT. Provisional WHT is not treated as a payment/settlement credit.
- **Income Statement / Tax Liability:** provisional WHT is memo information, not an operating expense; certificate-backed WHT is shown as a tax-credit receivable asset.
- **Document preview:** Reports, Claims Schedule, Statement of Account and Claim Diagnosis PDF actions now open previews. The Reports Print action also opens a preview before invoking the browser print/save dialog. Users can then print or save from the preview.
- **Letterhead Designer:** the existing editor has a focused `#/letterhead-designer` route and sidebar link, reusing the existing settings persistence and branding controls.
- **Settlement capture UX:** New settlement period is a button opening a dialog instead of a permanent inline form.
- **Navigation and form labels:** sidebar sections are grouped by function and only the active section stays expanded. Form labels wrap within their containers to prevent clipping.
- **Reports permissions:** each report now requires the appropriate source permissions; missing permissions show an access warning and disable output rather than presenting misleading zero/partial financial values. No underlying RLS policy was broadened.

The eight principal Reports tabs already exist; this tranche fixes their source-access behavior and accounting/presentation, not duplicate report tabs.

### Production release status

These migrations are tested only in the disposable PostgreSQL workflow. The connected production database still has the previously recorded 74-migration ledger, missing settlement/remittance/exception/case/draft objects and unresolved history reconciliation. Do not apply the new WHT receipt/rate migrations or enable the WHT certificate UI until the full migration chain is reconciled and the approved restore safety prerequisite is satisfied. No production DDL, data, permissions or Auth settings were changed in this tranche.

Backup feature development remains explicitly on hold; PR #128 is not part of this implementation tranche.


## Read-only production refresh — 2026-11-28 16:05 UTC

Connected project `jajfdgknctzqypdtvmxo` remains `ACTIVE_HEALTHY` on PostgreSQL 17.11. The migration ledger remains at **74 records**, latest `20260921160938`; migration provenance reconciliation is still a release blocker.

The live data count is not empty (correcting earlier compact inventory notes): 14 insurance companies, 1 claim, 1 payment, 1 withholding-tax row, 3 ledger entries, 1 profile and 1 user-role row. There are **0 claims settlement periods, 0 facilities and 0 facility memberships**. This is insufficient for end-to-end facility-scoped verification and for enabling the new facility-scoped workflows. The global `system_settings.withholding_tax_rate` is configured at **7.5%**; the safe `get_configured_withholding_tax_rate` RPC is not yet deployed.

The canonical prepared-document handoff relation `preauthorization_submissions` remains missing. The existing `preauth_submissions` relation is legacy-only and must not be reused. The canonical relation and corrected finalizer are in the source migration sequence, but the production finalizer still has the old relation contract; keep prepared-handoff registration disabled.

Other missing production objects remain:
- Settlement: `claims_settlement_remittances`, `claims_settlement_receipt_months`, `settlement_exceptions`, `settlement_exception_audit_events`.
- Claims: `claim_cases`, `claim_case_events`, `claim_diagnosis_drafts`.
- WHT receipts: `withholding_tax_receipts` and `record_withholding_tax_receipt`.
- Facility letterhead: `get_facility_letterhead_settings`, `save_facility_letterhead_settings` and the `facility-logos` storage bucket.
- `claims_settlement_periods` lacks `approved_gross_amount` and `actual_receipt_date`.

The live `claims_outstanding_periods` view still uses provisional WHT in the outstanding formula. PR #148 adds `20261128153000_correct_claims_outstanding_actual_wht.sql`: provisional WHT and actual WHT per advice remain separately visible, but only the amount supported by a tax certificate received and recorded by the facility reduces Accounts Receivable and the outstanding balance. Partial certificates reduce the balance only by the certified amount. This source correction is not deployed to production.

Security Advisor findings remain: `role_permissions` is deny-by-default with no direct client policy (intentional; do not expose the RBAC table), five authenticated-callable SECURITY DEFINER functions need their individual caller contracts preserved/reviewed, and Auth leaked-password protection remains disabled pending an owner-approved Auth setting change. No production DDL, grants, Auth settings or data writes were performed during this refresh.

Backup development remains on hold. PR #128 is not part of this implementation and remains unmerged.
