# CareFlow Hub — production migration ledger snapshot

**Captured:** 2026-11-28 09:17 UTC (read-only; refreshed Supabase migration API inventory)  
**Project:** `jajfdgknctzqypdtvmxo`  
**Database:** PostgreSQL 17.11, `eu-west-1`  
**Repository main commit:** `296af07ff08626f74d7975d112beaa9778a53608`

## Executive result

This is a source-name reconciliation aid, not authorization to deploy, repair, or edit the production migration ledger.

| Measure | Count |
|---|---:|
| SQL migration files in repository | 146 |
| Rows in production `supabase_migrations.schema_migrations` | 74 |
| Direct normalized name matches | 56 |
| Ledger rows without a unique direct source match | 18 |
| Source files without a direct ledger-name match | 90 |
| Source files later than the live latest ledger version | 32 |
| Duplicate repository version-prefix groups | 3 |

The production ledger still ends at `20260921160938` (`fix_facility_policy_recursion_runtime`). Filename similarity is not proof that the same SQL bytes were deployed. The ledger does not store source checksums; direct name matches do not establish semantic equivalence, while unmatched rows do not prove source loss.

## Production ledger — all recorded rows

| Ledger version | Recorded migration name | Normalized source match |
|---|---|---|
| `20260908181416` | `20260312132256_c436f1f7_ab3a_4209_b088_166cbf4c25f2` | `20260312132256_c436f1f7-ab3a-4209-b088-166cbf4c25f2.sql` |
| `20260908181426` | `20260314161659_572a3eee_99fe_4e8c_9bcd_6edf5ffccadb` | `20260314161659_572a3eee-99fe-4e8c-9bcd-6edf5ffccadb.sql` |
| `20260908181435` | `20260324160752_e38d18bc_b1a6_48f9_926b_00daeedb7af3` | `20260324160752_e38d18bc-b1a6-48f9-926b-00daeedb7af3.sql` |
| `20260908181442` | `20260325155056_2c55e220_3f0b_474d_87ac_0834c33710b4` | `20260325155056_2c55e220-3f0b-474d-87ac-0834c33710b4.sql` |
| `20260908181451` | `20260404162620_4dc6a42b_1106_4a66_982b_bca042f7c1d6` | `20260404162620_4dc6a42b-1106-4a66-982b-bca042f7c1d6.sql` |
| `20260908181458` | `20260616162619_5c445862_b171_4dfa_acce_887e6d6151ab` | `20260616162619_5c445862-b171-4dfa-acce-887e6d6151ab.sql` |
| `20260908181504` | `20260619090941_06302578_54c6_42da_b85a_fa81746917f6` | `20260619090941_06302578-54c6-42da-b85a-fa81746917f6.sql` |
| `20260908181514` | `20260620003326_abcc521f_e3e5_4807_8d26_a77be4db5546` | `20260620003326_abcc521f-e3e5-4807-8d26-a77be4db5546.sql` |
| `20260908181520` | `20260624225801_4ab00a09_a242_45a1_9e85_c2d611160397` | `20260624225801_4ab00a09-a242-45a1-9e85-c2d611160397.sql` |
| `20260908181529` | `20260712085826_9aae22eb_364a_430d_8795_30f87392250a` | `20260712085826_9aae22eb-364a-430d-8795-30f87392250a.sql` |
| `20260908181546` | `20260907095500_preauthorization_studio` | `20260907095500_preauthorization_studio.sql` |
| `20260908181603` | `20260907111500_preauth_deduplication_and_request_identity` | `20260907111500_preauth_deduplication_and_request_identity.sql` |
| `20260908181611` | `20260907112000_preauth_duplicate_guard` | `20260907112000_preauth_duplicate_guard.sql` |
| `20260908181938` | `20260907124500_preauth_text_first_duplicate_guard` | `20260907124500_preauth_text_first_duplicate_guard.sql` |
| `20260908181950` | `20260907131000_preauth_client_suggestions` | `20260907131000_preauth_client_suggestions.sql` |
| `20260908182005` | `20260907132500_preauth_atomic_dedup_boundary` | `20260907132500_preauth_atomic_dedup_boundary.sql` |
| `20260908182009` | `20260907132501_preauth_complete_fingerprint_name_compat` | **No unique direct match** |
| `20260908182017` | `20260907133000_preauth_atomic_and_client_suggestions` | `20260907133000_preauth_atomic_and_client_suggestions.sql` |
| `20260908182040` | `20260907140000_preauth_versions_workflow_hardening` | `20260907140000_preauth_versions_workflow_hardening.sql` |
| `20260908182059` | `20260907150000_preauth_facility_tenancy_foundation` | `20260907150000_preauth_facility_tenancy_foundation.sql` |
| `20260908182116` | `20260908120000_user_access_management` | `20260908120000_user_access_management.sql` |
| `20260908182132` | `20260908120001_seed_role_permissions` | **No unique direct match** |
| `20260908182146` | `20260908103000_core_rls_least_privilege` | `20260908103000_core_rls_least_privilege.sql` |
| `20260908182153` | `20260908173000_security_audit_log` | `20260908173000_security_audit_log.sql` |
| `20260908182157` | `20260908170000_lock_user_role_mutations` | `20260908170000_lock_user_role_mutations.sql` |
| `20260908182203` | `20260908162000_permission_aware_core_rls` | `20260908162000_permission_aware_core_rls.sql` |
| `20260908182223` | `20260908183000_harden_security_function_execution` | **No unique direct match** |
| `20260908182238` | `20260908183500_lock_internal_security_definer_rpcs` | **No unique direct match** |
| `20260908182250` | `20260908183600_harden_compat_fingerprint_search_path` | **No unique direct match** |
| `20260908182301` | `20260908184000_database_performance_hardening` | **No unique direct match** |
| `20260908182306` | `20260908184100_restore_tariff_rls` | **No unique direct match** |
| `20260908182312` | `20260908184200_refine_tariff_access` | **No unique direct match** |
| `20260908182730` | `finalize_permission_aware_rls` | `20260908190000_finalize_permission_aware_rls.sql` |
| `20260908182830` | `harden_remaining_rls_initplans` | `20260908191500_harden_remaining_rls_initplans.sql` |
| `20260908182844` | `consolidate_settings_rls` | `20260908192500_consolidate_settings_rls.sql` |
| `20260908183045` | `move_rls_security_helpers_internal` | `20260908194500_move_rls_security_helpers_internal.sql` |
| `20260908183321` | `harden_preauth_security_definers` | `20260908200000_harden_preauth_security_definers.sql` |
| `20260908183358` | `restore_preauth_rpc_execute_grants` | **No unique direct match** |
| `20260908194852` | `preauth_document_handoff_integrity` | `20260908203500_preauth_document_handoff_integrity.sql` |
| `20260908194924` | `fix_preauth_document_hash_schema` | **No unique direct match** |
| `20260908195225` | `harden_preauth_document_handoff_idempotency` | **No unique direct match** |
| `20260908220926` | `add_missing_preauth_foreign_key_indexes` | **No unique direct match** |
| `20260908222307` | `add_system_calculated_outstanding_periods` | `20260908220926_add_system_calculated_outstanding_periods.sql` |
| `20260908234726` | `add_actual_withholding_tax_settlement_state` | `20260908234600_add_actual_withholding_tax_settlement_state.sql` |
| `20260909064811` | `claims_settlement_period_model` | `20260908141000_claims_settlement_period_model.sql` |
| `20260909075750` | `harden_masterdata_rls_permissions_v2` | **No unique direct match** |
| `20260909075805` | `remove_duplicate_insurance_select_policy` | `20260909081000_remove_duplicate_insurance_select_policy.sql` |
| `20260909135839` | `index_claims_settlement_period_foreign_keys` | `20260909100000_index_claims_settlement_period_foreign_keys.sql` |
| `20260909140933` | `harden_preauthorization_rls_permissions` | `20260909103000_harden_preauthorization_rls_permissions.sql` |
| `20260909141006` | `optimize_preauthorization_rls_auth_initplans` | `20260909104500_optimize_preauthorization_rls_auth_initplans.sql` |
| `20260909143627` | `harden_preauthorization_workflow_integrity` | `20260909112000_harden_preauthorization_workflow_integrity.sql` |
| `20260909144027` | `harden_preauth_atomic_rpc_authorization` | `20260909130000_harden_preauth_atomic_rpc_authorization.sql` |
| `20260909144140` | `scope_preauth_client_suggestion_identity_by_facility` | `20260909144140_scope_preauth_client_suggestion_identity_by_facility.sql` |
| `20260909160039` | `lock_preauth_internal_function_execution` | `20260909150000_lock_preauth_internal_function_execution.sql` |
| `20260909160047` | `restore_preauth_rls_helper_execution` | **No unique direct match** |
| `20260909165102` | `lock_preauth_public_readonly_rpc_execution` | `20260909161000_lock_preauth_public_readonly_rpc_execution.sql` |
| `20260909170917` | `harden_preauth_lifecycle_transitions` | `20260909173000_harden_preauth_lifecycle_transitions.sql` |
| `20260909171050` | `deduplicate_preauth_transition_versions` | `20260909174000_deduplicate_preauth_transition_versions.sql` |
| `20260909200454` | `expose_preauth_transition_rpc_safely` | **No unique direct match** |
| `20260909200512` | `harden_preauth_transition_rpc_permissions` | `20260909180000_harden_preauth_transition_rpc_permissions.sql` |
| `20260909201124` | `align_preauth_transition_version_numbers` | `20260909190000_align_preauth_transition_version_numbers.sql` |
| `20260910145155` | `restore_preauthorization_finalize_handoff` | `20260910170000_restore_preauthorization_finalize_handoff.sql` |
| `20260910150136` | `restore_authenticated_security_helpers` | `20260910153000_restore_authenticated_security_helpers.sql` |
| `20260910150625` | `harden_preauth_finalize_duplicate_concurrency` | `20260910172000_harden_preauth_finalize_duplicate_concurrency.sql` |
| `20260910235920` | `harden_get_my_permissions_execution` | `20260910241000_harden_get_my_permissions_execution.sql` |
| `20260911002855` | `harden_remaining_sensitive_rls` | `20260910242000_harden_remaining_sensitive_rls.sql` |
| `20260911134711` | `relax_insurer_read_policy_for_operational_readers` | **No unique direct match** |
| `20260911134721` | `remove_redundant_insurer_select_policy` | **No unique direct match** |
| `20260911134735` | `align_insurer_read_access` | `20260911135000_align_insurer_read_access.sql` |
| `20260911135832` | `align_payment_reconciliation_rls` | `20260911100000_align_payment_reconciliation_rls.sql` |
| `20260911135845` | `dedupe_withholding_tax_read_policy` | `20260911100500_dedupe_withholding_tax_read_policy.sql` |
| `20260911141251` | `harden_preauth_items_select_permission` | `20260911102000_harden_preauth_items_select_permission.sql` |
| `20260911141435` | `20260911103000_harden_preauth_version_insert_authority` | `20260911103000_harden_preauth_version_insert_authority.sql` |
| `20260921160938` | `fix_facility_policy_recursion_runtime` | **No unique direct match** |

## Repository migration files later than the live ledger head

These 32 files are candidates requiring provenance reconciliation, not a declaration that all are unapplied:

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

## Duplicate repository version-prefix groups

### `20260907140000`
- `20260907140000_preauth_atomic_hardening.sql`
- `20260907140000_preauth_versions_workflow_hardening.sql`

### `20260907144000`
- `20260907144000_preauth_document_integrity.sql`
- `20260907144000_preauth_document_lifecycle.sql`

### `20260907145000`
- `20260907145000_preauth_audit_events.sql`
- `20260907145000_preauth_workflow_transitions.sql`

The disposable PostgreSQL workflow's normalization behavior is a test accommodation only. It is not evidence of which duplicate-timestamp source file was deployed to production. Do not rewrite or rename applied migration identities and do not use `migration repair` to force a match.

## Required disposition

1. Recover the authoritative deployed migration source bundle or deployment artifact for the 74 live ledger entries.
2. Reconcile every ledger row and current catalog object against source history, recording provenance and SHA-256 checksums for recovered SQL.
3. Resolve the three duplicate version groups from Git history and deployed artifact evidence; do not select a candidate by filename alone.
4. Verify which of the 32 later-version files are unapplied, superseded, already represented by a differently named migration, or intentionally omitted.
5. Produce an explicit forward-only migration crosswalk with dependencies, expected objects, grants, RLS, and rollback/containment notes.
6. Restore a verified encrypted production backup into a disposable environment and rehearse the complete proposed sequence there.
7. Run the migration suite and Supabase security/performance advisors against both a clean database and the restored copy before proposing a production release.

## Safety boundary

This inventory used the Supabase migration-list API and the GitHub main tree. It made no production SQL changes and did not alter schema, data, migration history, grants, RLS, Auth settings, Edge Functions, or secrets. No paid Supabase branch or project was created. Backup development remains paused, but verified backup and restoration remain prerequisites for production schema changes.
