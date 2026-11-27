# Production database capability gates

CareFlow Hub is deployed against a production Supabase project whose migration ledger may lag the repository. A successful source build or disposable migration replay does not prove that production has the same tables, columns, RPCs, grants, or facility data.

The GitHub Pages build therefore uses explicit, build-time capability flags. All flags default to **disabled** unless the corresponding GitHub Actions repository Variable is set to the exact string `true`.

| GitHub Actions repository Variable | Enables | Required production objects/checks |
|---|---|---|
| `CARE_FLOW_PREAUTH_HANDOFF_ENABLED` | Frozen prepared-handoff registration in Pre-Authorization Studio | `preauthorization_submissions`, corrected `finalize_preauthorization_handoff` wrapper/private function, prepared-only status contract, audit and document registry objects, RLS/grants, and finalizer SQL contract |
| `CARE_FLOW_CLAIM_CASES_ENABLED` | Individual claim cases and lifecycle history | `claim_cases`, `claim_case_events`, create/transition RPCs, RLS/grants, and lifecycle SQL contracts |
| `CARE_FLOW_SETTLEMENT_EXCEPTIONS_ENABLED` | Online settlement exception register | `settlement_exceptions`, `settlement_exception_audit_events`, record/transition RPCs, RLS/grants, and exception SQL contracts |
| `CARE_FLOW_SETTLEMENT_REMITTANCES_ENABLED` | Payment-advice remittance history, reversals and reconciliation | `claims_settlement_remittances`, `claims_settlement_receipt_months`, `approved_gross_amount`, `actual_receipt_date`, remittance/reversal RPCs, scoped permissions, RLS/grants, and remittance SQL contracts |
| `CARE_FLOW_FACILITY_ADMIN_ENABLED` | Facility creation, owner/member onboarding, suspension and facility WHT-rate administration | `create_facility_with_owner`, `add_facility_member_by_email`, `deactivate_facility_member`, `set_facility_provisional_wht_rate`, superuser-only wrappers, private helpers, RLS/grants and onboarding SQL contract tests |
| `CARE_FLOW_NOTIFICATION_EVENTS_ENABLED` | Audit-driven notification routing, event metadata and read timestamps | Additive notification metadata columns, audit-to-notification fan-out trigger, recipient/idempotency indexes, RLS/grants and notification delivery contract tests |

## Current production release state

The latest read-only audit of Supabase project `jajfdgknctzqypdtvmxo` found a 74-row migration ledger with latest version `20260921160938`. The production database is missing the objects listed above, and `claims_settlement_periods` does not yet contain `approved_gross_amount` or `actual_receipt_date`. The canonical prepared-handoff relation `preauthorization_submissions` is absent; the legacy `preauth_submissions` relation must not be reused. The live prepared-handoff finalizer still references the misspelled `pre_auth_submissions` relation.

The individual claim-case and online settlement-exception schemas/RPCs are also absent. Facility and facility-membership tables exist but currently have no rows. Facility-administration RPCs (`create_facility_with_owner`, `add_facility_member_by_email`, `deactivate_facility_member` and `set_facility_provisional_wht_rate`) are absent. The additive notification event metadata, audit fan-out trigger and notification routing columns are also not deployed; existing legacy notifications remain available. The live RBAC layout is the legacy-compatible shape: `app_permissions.permission_key`, `role_permissions.permission_key` without a `granted` column, and `user_permission_overrides.allowed`. The `claims.settlement.read` and `claims.settlement.write` catalogue entries and role grants are absent.

## Enabling a capability after release approval

1. Complete the verified backup and restoration rehearsal and semantic migration crosswalk documented in [Migration Reconciliation](MIGRATION_RECONCILIATION.md).
2. Apply only the reviewed forward-only migration plan to the intended project, with explicit owner approval. Do not bypass duplicate migration versions or run an unreviewed `db push`.
3. Run the production release preflight and verify the required relations, columns, RPC definitions, RLS policies, grants, role permissions, and facility membership data.
4. In GitHub, open **Settings → Secrets and variables → Actions → Variables** and set only the variable for the fully verified capability to `true`.
5. Rebuild and deploy. Enable each capability independently; do not turn on all flags just because one migration succeeded.

These are feature flags, not secrets. Never put Supabase keys or credentials in them. Do not enable any of the six flags for the current production schema.
