# CareFlow Hub — consolidated blocker register

**Snapshot:** 2026-11-28  
**Repository:** `kingpumpski/careflow-hub`  
**Production Supabase project:** `jajfdgknctzqypdtvmxo`  
**Main commit at snapshot:** `1d718f288006a5369fe3d9a853473680d33b2fb7`

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

The report screen now includes approved gross and approval variance in the account-balance table when insurer advice is available. The cash-receipts report is derived from the existing `payments` table and remains available independently of the missing remittance ledger/view. It does not treat payment month as the claims cycle and does not infer actual-WHT receipt date. PDF, Excel and print paths are included in the source change and remain subject to CI validation.

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
