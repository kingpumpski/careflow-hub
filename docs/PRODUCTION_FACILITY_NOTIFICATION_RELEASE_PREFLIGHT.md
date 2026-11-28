# Facility, audit and notification production release preflight

**Snapshot date:** 2026-11-28 09:17 UTC  
**Supabase project:** `jajfdgknctzqypdtvmxo` (`claims tracker`, `eu-west-1`)  
**Release status:** BLOCKED — repository implementation is merged/deployed, but production schema is behind the source migration chain.

This document records a read-only production inspection. It does not authorize production DDL, data writes, migration repair, migration-ledger edits, Auth changes or Edge Function deployment.

## Verified production state

A fresh read-only Supabase inspection at 2026-11-27 15:41 UTC confirmed:

| Area | Live state |
|---|---|
| Project health | `ACTIVE_HEALTHY`, PostgreSQL 17.11 |
| Latest migration ledger entry | `20260921160938 fix_facility_policy_recursion_runtime` |
| Migration ledger size | 74 rows |
| Facilities | Table exists; 0 rows |
| Facility memberships | Table exists; 0 rows |
| Facility admin RPCs | `create_facility_with_owner`, `add_facility_member_by_email`, `deactivate_facility_member`, `set_facility_provisional_wht_rate` are absent |
| Notifications | Table exists with only `id,user_id,title,message,read,created_at` |
| Audit log | `audit_logs` exists; current row trigger covers only claims, payments, withholding_tax, insurance_companies, ledger_entries and pre_authorizations |
| Security audit log | `security_audit_log` exists |
| Notification fan-out triggers | Not deployed |
| Existing notification RLS | User-scoped SELECT and UPDATE; INSERT is restricted to the user or privileged roles |
| Audit log RLS | SELECT is permission-scoped through `audit.read` |
| Letterhead settings RPC | Not present in the live migration state |
| Claim diagnosis draft persistence | `claim_diagnosis_drafts` table absent |
| Settlement/claim-case release | Exception, claim-case, remittance and receipt-month objects absent; approved gross and actual receipt-date columns absent |
| Pre-authorization finalizer | Correct prepared-handoff table `preauthorization_submissions` is absent; live private function still references both the legacy `preauth_submissions` queue and absent misspelled `pre_auth_submissions` |
| Claims-officer settlement access | `claims.settlement.read/write` permission keys/grants absent |

The live database has the facility base tables but not the reviewed onboarding/membership/WHT RPCs. The facility table count and membership count are both zero; this is a point-in-time read, not an instruction to seed or alter production.

## Repository migrations after the live ledger head

At the start of this follow-up, the current main branch had 30 migration files whose version prefixes were later than the live latest version. This branch adds two proposed follow-up migrations: `20261127180000_complete_operational_audit_coverage.sql` and `20261127190000_allow_document_readers_letterhead.sql`. The full list below therefore contains 32 entries for this branch. They must be treated as **unreconciled candidates**, not automatically as unapplied migrations. The live ledger records names/versions, not the original SQL bytes/checksums.

1. `20260921161000_fix_facility_rls_runtime_recursion.sql`
2. `20261104085000_claim_diagnosis_assistant.sql`
3. `20261120160000_settlement_exception_atomic_lifecycle.sql`
4. `20261120170000_individual_claim_case_lifecycle.sql`
5. `20261120173000_facility_admin_onboarding.sql`
6. `20261121160000_atomic_monthly_claim_submission.sql`
7. `20261122211454_harden_preauth_request_number_search_path.sql`
8. `20261122211659_harden_remaining_security_definer_search_paths.sql`
9. `20261123110000_remove_implicit_settlement_wht_rate.sql`
10. `20261123113000_separate_provisional_actual_wht_reporting.sql`
11. `20261123130000_harden_atomic_payment_import_validation.sql`
12. `20261123140000_claims_settlement_scoped_permissions.sql`
13. `20261123141000_enforce_claims_settlement_scoped_rls.sql`
14. `20261123153000_add_claims_settlement_remittance_ledger.sql`
15. `20261123160000_match_aggregate_claims_periods_and_receipt_months.sql`
16. `20261123170000_add_claims_settlement_remittance_reversals.sql`
17. `20261123173000_exclude_reversed_remittances_from_receipt_reporting.sql`
18. `20261124120000_scope_monthly_claim_posting_to_facility.sql`
19. `20261124121000_facility_provisional_wht_rate.sql`
20. `20261124123000_idempotent_monthly_claim_period_submission.sql`
21. `20261124130000_repair_get_my_permissions_catalog_join.sql`
22. `20261124132000_harden_internal_permission_grants.sql`
23. `20261124133000_harden_audit_trigger_execution.sql`
24. `20261125100000_fix_facility_membership_conflict_targets.sql`
25. `20261125110000_allow_scoped_settlement_exception_permissions.sql`
26. `20261125120000_superuser_only_facility_admin.sql`
27. `20261125130000_report_letterhead_read_rpc.sql`
28. `20261126150000_restore_prepared_preauthorization_handoff_contract.sql`
29. `20261126160000_harden_prepared_preauth_wrapper_security.sql`
30. `20261127170000_facility_wht_and_audit_notifications.sql`
31. `20261127180000_complete_operational_audit_coverage.sql`
32. `20261127190000_allow_document_readers_letterhead.sql`

Do not replay only the last two facility/notification migrations. Several preceding migrations establish permission grants, facility scoping, settlement schema, WHT semantics and function hardening that the later migrations depend on.

## Audit and notification coverage

The production audit trigger currently covers six tables only. The new source migration `20261127180000_complete_operational_audit_coverage.sql` adds row-level audit coverage for facility memberships, user profiles, chat messages, permission catalogue/grants, master data, prepared-document lifecycle records, settlement records and claim-case records.

It also:
- supports composite-key tables that do not have an `id` column;
- redacts direct patient/user contact identifiers and clinical/message/configuration payloads before audit snapshots are stored;
- keeps internal version/event rows in the audit trail while suppressing duplicate end-user notifications for implementation-detail rows;
- routes chat messages to sender/recipient, membership changes to the target member and actor, facility-scoped changes to active facility members, and global records to users in relevant operational roles;
- sends security-audit notifications to the affected account and the administrative actor;
- keeps trigger functions in the private security schema where appropriate and revokes client RPC execution.

The new `20261127190000_allow_document_readers_letterhead.sql` extends the least-privilege letterhead reader to users with `reports.read`, `ledger.read`, `claims.read` or `preauth.read`. A shared client hook now uses that RPC from Reports, Statements of Account, Schedule Generator, Claim Diagnosis Assistant and Pre-Authorization. If the RPC is not released, the client does not call it; only `settings.manage` users can use a narrow branding-key fallback, and ordinary operational users do not receive broad `system_settings` access. Company-specific report and schedule PDFs now include the selected insurer's name and available contact details; Pre-Authorization PDFs include insurer address, contact person, telephone and email, while Statements of Account and Claim Diagnosis PDFs retain their existing counterparty blocks.

The audit log remains the source of truth for monitoring. Notifications are a user-facing delivery layer, not a substitute for the audit record. Notification delivery is idempotent per recipient/event. Redaction applies to new audit snapshots only; this migration does not rewrite historical audit rows.

## Security-advisor findings to review

The live security advisor reported:
- five authenticated-callable SECURITY DEFINER functions: `current_user_has_any_role`, `current_user_has_permission`, `finalize_preauthorization_handoff`, `get_my_permissions`, and `user_has_facility_access`;
- leaked-password protection disabled;
- `role_permissions` RLS enabled with no policy (currently deny-by-default).

A fresh read-only function-definition and policy-reference inspection narrowed these warnings:

- `current_user_has_any_role`, `current_user_has_permission` and `user_has_facility_access` all derive the subject from `auth.uid()`, use a fixed empty search path, and return only a boolean for the caller's own role/permission/facility access. Existing RLS policies still call these public wrappers on legacy tables; revoking them blindly can break reads/writes or silently deny legitimate operations. The private `security_internal` helpers are also used directly by newer policies.
- `get_my_permissions()` returns only the caller's permission keys based on `auth.uid()`; the UI and the security-audit-log policy use it. It is an intended authenticated RPC, not a general permission-catalog dump.
- `finalize_preauthorization_handoff` is a public wrapper around a private SECURITY DEFINER function. The intended prepared-document register is `public.preauthorization_submissions`. The similarly named `public.preauth_submissions` is a legacy insurer execution queue and must not be reused; `public.pre_auth_submissions` is an invalid/misspelled relation. A fresh read-only catalog and function-definition check on 2026-11-28 confirmed that the prepared-document register is absent and the live private finalizer references both the legacy queue and the misspelled relation, without referencing the intended prepared-document register. This is a real execution blocker, not a reason to revoke the whole wrapper. The source migration `20261126150000_restore_prepared_preauthorization_handoff_contract.sql` creates and writes the correct prepared-only relation; its companion wrapper-hardening migration must also be validated in the restored migration rehearsal.

Do not blindly revoke a function required by RLS or the UI, and do not add a broad `role_permissions` policy. The leaked-password protection setting should be enabled only after confirming the intended password policy and testing the login/password-reset flow; this inspection did not change Auth settings.

## Required release gates

1. **Backup remains on hold as a development priority**, but a verified encrypted backup and a successful restore rehearsal are still mandatory prerequisites before production schema changes. Do not merge or deploy the backup workstream merely to bypass this release gate.
2. Recover the authoritative deployed migration source bundle or equivalent deployment artifact. Reconcile all 74 live ledger rows and the live catalog to the current repository history. Do not infer applied status from similar names.
3. Resolve the documented duplicate migration-version groups using provenance evidence and a forward-only reconciliation plan. Test-only normalization in disposable CI is not production migration provenance.
4. Restore the verified production backup into a disposable environment and validate the proposed forward-only sequence against that restored state.
5. Run all SQL behavioral tests and verify facility onboarding, owner membership, add/suspend membership, WHT-rate authorization, RLS, notification fan-out, audit redaction, security-audit notifications, settlement reconciliation and letterhead RPC access.
6. Run Supabase security/performance advisors on the restored copy. Review the five existing SECURITY DEFINER warnings and leaked-password protection.
7. Only after the above gates pass, apply the reviewed migrations in a controlled release window, re-run the read-only preflight, verify representative superuser/claims-officer/accounts-officer/member identities, then enable the matching GitHub Actions variables.
8. Create `TEST-HOSPITAL-01` only after the production RPCs and RLS checks pass. The template is `CareFlow Test Hospital`, country `GH`, timezone `Africa/Accra`, currency `GHS`, date format `DD/MM/YYYY`.

## Current frontend release flags

The GitHub Pages workflow reads these repository variables:

- `CARE_FLOW_FACILITY_ADMIN_ENABLED`
- `CARE_FLOW_NOTIFICATION_EVENTS_ENABLED`
- `CARE_FLOW_DOCUMENT_LETTERHEAD_ENABLED`
- `CARE_FLOW_CLAIM_DIAGNOSIS_DRAFTS_ENABLED`
- `CARE_FLOW_SETTLEMENT_EXCEPTIONS_ENABLED`
- `CARE_FLOW_SETTLEMENT_REMITTANCES_ENABLED`

Keep each optional capability false until its corresponding production objects and permissions have been verified. When the notification migration is released, enable `CARE_FLOW_NOTIFICATION_EVENTS_ENABLED` in the same release window as the database change; the client uses that flag to avoid duplicating the legacy pre-authorization notification fallback. A successful frontend deployment is not proof that database migrations are deployed.

## Change boundary

The 2026-11-27 and 2026-11-28 inspections and source updates were read-only against production. No production DDL, data, migration ledger, Auth configuration, Edge Function or secret was changed. Existing facility rows remain untouched.


## Read-only refresh — 2026-11-28

A fresh catalog check against the same production project confirmed the following prepared-handoff state:

| Check | Result |
|---|---|
| `public.preauthorization_submissions` | Missing |
| `public.preauth_submissions` (legacy insurer execution queue) | Present |
| `public.pre_auth_submissions` (misspelled relation) | Missing |
| Live private finalizer references `public.preauthorization_submissions` | No |
| Live private finalizer references `public.preauth_submissions` | Yes |
| Live private finalizer references `public.pre_auth_submissions` | Yes |
| Public wrapper is SECURITY INVOKER | No — it is still SECURITY DEFINER |
| Public wrapper has an empty `search_path` | Yes |
| Authenticated can execute the public wrapper | Yes |
| Anonymous can execute the public wrapper | No |
| Notification recipient RLS/UPDATE isolation | Pass — existing policy is user-scoped |

The read-only release diagnostic has been corrected to require the intended prepared-handoff relation, reject both noncanonical relation references, and verify that the public wrapper is SECURITY INVOKER with an empty search path, authenticated execution and no anonymous execution. The diagnostic remains SELECT-only. No production schema, records, migration ledger, grants, Auth settings or Edge Functions were changed.


## 2026-11-28 consolidated blocker refresh

The live migration API still reports **74 rows**, with latest version `20260921160938`. The refreshed repository inventory contains **146 SQL migration files**, **56 unique direct normalized-name matches**, **18 ledger rows without a unique direct source match**, **90 source files without a direct ledger-name match**, **32 files later than the live ledger head**, and the same **three duplicate version-prefix groups**. See [`MIGRATION_LEDGER_SNAPSHOT_2026-11-28.md`](MIGRATION_LEDGER_SNAPSHOT_2026-11-28.md) for the full current ledger and candidate inventory. These are provenance blockers; no migration was marked applied or replayed.

A read-only catalog check on 2026-11-28 confirmed the following required relation states:

| Relation | Expected kind | Live result |
|---|---|---|
| `preauthorization_submissions` | table | Missing |
| `claim_cases` | table | Missing |
| `claim_case_events` | table | Missing |
| `settlement_exceptions` | table | Missing |
| `settlement_exception_audit_events` | table | Missing |
| `claims_settlement_remittances` | table | Missing |
| `claims_settlement_receipt_months` | view | Missing |
| `claim_diagnosis_drafts` | table | Missing |
| `facilities`, `facility_memberships` | tables | Present |
| `notifications`, `audit_logs`, `security_audit_log` | tables | Present |

The report screen has also been extended in source to expose a dedicated cash-receipts-by-payment-month report and to show approved gross/approval variance plus separate provisional and actual WHT in the relevant on-screen tables. Cash receipts use the existing `payments.payment_date` and `amount_paid` source; they do not depend on the missing remittance view and do not infer actual-WHT receipt dates. This frontend work was merged in PR #141 as commit `53dbcb4e53a88b0373b8b694b2ba46dd5bedda02`. CI, quality, dependency audit and disposable PostgreSQL migration replay passed on the exact PR head; the merge-commit GitHub Pages deployment and published-site smoke test passed. It does not enable any database capability flag.

The remaining release blockers and their required dispositions are tracked in `docs/CARE_FLOW_BLOCKER_REGISTER_2026-11-28.md`. No production DDL, data writes, migration-ledger changes, grants, Auth changes, Edge Function deployments or secret changes were made during this refresh.


## Post-merge frontend verification — 2026-11-28

- Main commit: `53dbcb4e53a88b0373b8b694b2ba46dd5bedda02`.
- PR #141 report and blocker-register changes passed CI, quality, dependency audit and disposable PostgreSQL migration replay before merge.
- GitHub Pages build, hash-routing verification, deployment and published-site smoke test completed successfully for the merge commit.
- These checks validate the source/frontend release only. The production database migration ledger remains at `20260921160938`; missing production relations and RPCs remain blocked pending backup/restore and migration-provenance gates.


## Fresh read-only recheck — 2026-11-28 09:17 UTC

The migration API still reports 74 rows and latest version `20260921160938`. A fresh catalog query confirmed:
- Missing: `preauthorization_submissions`, `claim_cases`, `claim_case_events`, `settlement_exceptions`, `settlement_exception_audit_events`, `claims_settlement_remittances`, `claims_settlement_receipt_months`, and `claim_diagnosis_drafts`.
- Present: `claims_settlement_periods` (RLS enabled) and `claims_outstanding_periods` view.
- The existing `claims_settlement_periods` table does not yet contain `approved_gross_amount` or `actual_receipt_date`.
- `claims.settlement.read` and `claims.settlement.write` remain absent from the live permission catalogue.
- The live public `finalize_preauthorization_handoff` wrapper remains SECURITY DEFINER with an empty search path.

The current source branch adds a claims-cycle Settlement Reconciliation report against the existing settlement-period table. It preserves null/unknown historical approved-gross values and is not a production schema release. All database feature flags remain disabled.
