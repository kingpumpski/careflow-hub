# Facility, audit and notification production release preflight

**Snapshot date:** 2026-11-27  
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

The live database has the facility base tables but not the reviewed onboarding/membership/WHT RPCs. The facility table count and membership count are both zero; this is a point-in-time read, not an instruction to seed or alter production.

## Repository migrations after the live ledger head

At the start of this follow-up, the current main branch had 30 migration files whose version prefixes were later than the live latest version. This branch adds the 31st proposed follow-up migration, `20261127180000_complete_operational_audit_coverage.sql`. The full list below therefore contains 31 entries for this branch. They must be treated as **unreconciled candidates**, not automatically as unapplied migrations. The live ledger records names/versions, not the original SQL bytes/checksums.

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

The audit log remains the source of truth for monitoring. Notifications are a user-facing delivery layer, not a substitute for the audit record. Notification delivery is idempotent per recipient/event.

## Security-advisor findings to review

The live security advisor reported:
- five authenticated-callable SECURITY DEFINER functions: `current_user_has_any_role`, `current_user_has_permission`, `finalize_preauthorization_handoff`, `get_my_permissions`, and `user_has_facility_access`;
- leaked-password protection disabled;
- `role_permissions` RLS enabled with no policy (currently deny-by-default).

These findings must be reviewed against the intended client RPC contract and the actual production function bodies. Do not blindly revoke a function required by RLS or the UI, and do not add a broad `role_permissions` policy. The pre-authorization finalizer is especially sensitive because production/source function-body drift was previously identified.

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
- `CARE_FLOW_CLAIM_DIAGNOSIS_DRAFTS_ENABLED`
- `CARE_FLOW_SETTLEMENT_EXCEPTIONS_ENABLED`
- `CARE_FLOW_SETTLEMENT_REMITTANCES_ENABLED`

Keep each optional capability false until its corresponding production objects and permissions have been verified. A successful frontend deployment is not proof that database migrations are deployed.

## Change boundary

The 2026-11-27 inspections and source updates were read-only against production. No production DDL, data, migration ledger, Auth configuration, Edge Function or secret was changed. Existing facility rows remain untouched.
