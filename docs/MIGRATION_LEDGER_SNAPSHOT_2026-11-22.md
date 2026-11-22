# CareFlow Hub — production migration ledger snapshot

**Captured:** 2026-11-22 (read-only)  
**Project:** `jajfdgknctzqypdtvmxo`  
**Database:** PostgreSQL 17.11, `eu-west-1`  
**Main commit used for repository inventory:** `f79f807382f1af8a65007983f89a9f82942214f5`

## Executive result

This is a filename-level reconciliation aid, not authorization to deploy or repair the ledger.

| Measure | Count |
|---|---:|
| SQL migration files in repository | 117 |
| Rows in production `supabase_migrations.schema_migrations` | 74 |
| Direct normalized name matches | 56 |
| Repository files without a direct ledger-name match | 61 |
| Ledger rows without a direct repository filename match | 18 |
| Duplicate repository version-prefix groups | 3 |

The matching heuristic removes the `.sql` suffix, strips a leading 14-digit timestamp plus underscore, and normalizes hyphens to underscores. It matches 56 entries by name. The remaining unmatched entries require manual source-history and schema inspection; they are **not automatically proof** that a migration was never applied or that a source file is lost.

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
| `20260908182009` | `20260907132501_preauth_complete_fingerprint_name_compat` | **No direct match** |
| `20260908182017` | `20260907133000_preauth_atomic_and_client_suggestions` | `20260907133000_preauth_atomic_and_client_suggestions.sql` |
| `20260908182040` | `20260907140000_preauth_versions_workflow_hardening` | `20260907140000_preauth_versions_workflow_hardening.sql` |
| `20260908182059` | `20260907150000_preauth_facility_tenancy_foundation` | `20260907150000_preauth_facility_tenancy_foundation.sql` |
| `20260908182116` | `20260908120000_user_access_management` | `20260908120000_user_access_management.sql` |
| `20260908182132` | `20260908120001_seed_role_permissions` | **No direct match** |
| `20260908182146` | `20260908103000_core_rls_least_privilege` | `20260908103000_core_rls_least_privilege.sql` |
| `20260908182153` | `20260908173000_security_audit_log` | `20260908173000_security_audit_log.sql` |
| `20260908182157` | `20260908170000_lock_user_role_mutations` | `20260908170000_lock_user_role_mutations.sql` |
| `20260908182203` | `20260908162000_permission_aware_core_rls` | `20260908162000_permission_aware_core_rls.sql` |
| `20260908182223` | `20260908183000_harden_security_function_execution` | **No direct match** |
| `20260908182238` | `20260908183500_lock_internal_security_definer_rpcs` | **No direct match** |
| `20260908182250` | `20260908183600_harden_compat_fingerprint_search_path` | **No direct match** |
| `20260908182301` | `20260908184000_database_performance_hardening` | **No direct match** |
| `20260908182306` | `20260908184100_restore_tariff_rls` | **No direct match** |
| `20260908182312` | `20260908184200_refine_tariff_access` | **No direct match** |
| `20260908182730` | `finalize_permission_aware_rls` | `20260908190000_finalize_permission_aware_rls.sql` |
| `20260908182830` | `harden_remaining_rls_initplans` | `20260908191500_harden_remaining_rls_initplans.sql` |
| `20260908182844` | `consolidate_settings_rls` | `20260908192500_consolidate_settings_rls.sql` |
| `20260908183045` | `move_rls_security_helpers_internal` | `20260908194500_move_rls_security_helpers_internal.sql` |
| `20260908183321` | `harden_preauth_security_definers` | `20260908200000_harden_preauth_security_definers.sql` |
| `20260908183358` | `restore_preauth_rpc_execute_grants` | **No direct match** |
| `20260908194852` | `preauth_document_handoff_integrity` | `20260908203500_preauth_document_handoff_integrity.sql` |
| `20260908194924` | `fix_preauth_document_hash_schema` | **No direct match** |
| `20260908195225` | `harden_preauth_document_handoff_idempotency` | **No direct match** |
| `20260908220926` | `add_missing_preauth_foreign_key_indexes` | **No direct match** |
| `20260908222307` | `add_system_calculated_outstanding_periods` | `20260908220926_add_system_calculated_outstanding_periods.sql` |
| `20260908234726` | `add_actual_withholding_tax_settlement_state` | `20260908234600_add_actual_withholding_tax_settlement_state.sql` |
| `20260909064811` | `claims_settlement_period_model` | `20260908141000_claims_settlement_period_model.sql` |
| `20260909075750` | `harden_masterdata_rls_permissions_v2` | **No direct match** |
| `20260909075805` | `remove_duplicate_insurance_select_policy` | `20260909081000_remove_duplicate_insurance_select_policy.sql` |
| `20260909135839` | `index_claims_settlement_period_foreign_keys` | `20260909100000_index_claims_settlement_period_foreign_keys.sql` |
| `20260909140933` | `harden_preauthorization_rls_permissions` | `20260909103000_harden_preauthorization_rls_permissions.sql` |
| `20260909141006` | `optimize_preauthorization_rls_auth_initplans` | `20260909104500_optimize_preauthorization_rls_auth_initplans.sql` |
| `20260909143627` | `harden_preauthorization_workflow_integrity` | `20260909112000_harden_preauthorization_workflow_integrity.sql` |
| `20260909144027` | `harden_preauth_atomic_rpc_authorization` | `20260909130000_harden_preauth_atomic_rpc_authorization.sql` |
| `20260909144140` | `scope_preauth_client_suggestion_identity_by_facility` | `20260909144140_scope_preauth_client_suggestion_identity_by_facility.sql` |
| `20260909160039` | `lock_preauth_internal_function_execution` | `20260909150000_lock_preauth_internal_function_execution.sql` |
| `20260909160047` | `restore_preauth_rls_helper_execution` | **No direct match** |
| `20260909165102` | `lock_preauth_public_readonly_rpc_execution` | `20260909161000_lock_preauth_public_readonly_rpc_execution.sql` |
| `20260909170917` | `harden_preauth_lifecycle_transitions` | `20260909173000_harden_preauth_lifecycle_transitions.sql` |
| `20260909171050` | `deduplicate_preauth_transition_versions` | `20260909174000_deduplicate_preauth_transition_versions.sql` |
| `20260909200454` | `expose_preauth_transition_rpc_safely` | **No direct match** |
| `20260909200512` | `harden_preauth_transition_rpc_permissions` | `20260909180000_harden_preauth_transition_rpc_permissions.sql` |
| `20260909201124` | `align_preauth_transition_version_numbers` | `20260909190000_align_preauth_transition_version_numbers.sql` |
| `20260910145155` | `restore_preauthorization_finalize_handoff` | `20260910170000_restore_preauthorization_finalize_handoff.sql` |
| `20260910150136` | `restore_authenticated_security_helpers` | `20260910153000_restore_authenticated_security_helpers.sql` |
| `20260910150625` | `harden_preauth_finalize_duplicate_concurrency` | `20260910172000_harden_preauth_finalize_duplicate_concurrency.sql` |
| `20260910235920` | `harden_get_my_permissions_execution` | `20260910241000_harden_get_my_permissions_execution.sql` |
| `20260911002855` | `harden_remaining_sensitive_rls` | `20260910242000_harden_remaining_sensitive_rls.sql` |
| `20260911134711` | `relax_insurer_read_policy_for_operational_readers` | **No direct match** |
| `20260911134721` | `remove_redundant_insurer_select_policy` | **No direct match** |
| `20260911134735` | `align_insurer_read_access` | `20260911135000_align_insurer_read_access.sql` |
| `20260911135832` | `align_payment_reconciliation_rls` | `20260911100000_align_payment_reconciliation_rls.sql` |
| `20260911135845` | `dedupe_withholding_tax_read_policy` | `20260911100500_dedupe_withholding_tax_read_policy.sql` |
| `20260911141251` | `harden_preauth_items_select_permission` | `20260911102000_harden_preauth_items_select_permission.sql` |
| `20260911141435` | `20260911103000_harden_preauth_version_insert_authority` | `20260911103000_harden_preauth_version_insert_authority.sql` |
| `20260921160938` | `fix_facility_policy_recursion_runtime` | **No direct match** |

## Repository migration files not directly matched to a production ledger name

- `20260907123000_preauth_text_first_identity.sql`
- `20260907140000_preauth_atomic_hardening.sql`
- `20260907140500_preauth_version_audit_trigger.sql`
- `20260907141000_preauth_deferred_version_capture.sql`
- `20260907141500_preauth_version_trigger_syntax.sql`
- `20260907142000_preauth_server_authoritative_integrity.sql`
- `20260907143000_preauth_atomic_amendments.sql`
- `20260907143100_preauth_amendment_fingerprint_hash.sql`
- `20260907144000_preauth_document_integrity.sql`
- `20260907144000_preauth_document_lifecycle.sql`
- `20260907145000_preauth_audit_events.sql`
- `20260907145000_preauth_workflow_transitions.sql`
- `20260907145500_preauth_version_action_refinement.sql`
- `20260907151000_preauth_facility_atomic_integrity.sql`
- `20260907151100_preauth_atomic_table_name_correction.sql`
- `20260907152000_preauth_facility_rls_hardening.sql`
- `20260907152100_facility_membership_rls_recursion_fix.sql`
- `20260907153100_preauth_amendment_function_final.sql`
- `20260907154000_preauth_submission_lifecycle.sql`
- `20260907155000_preauth_version_facility_integrity.sql`
- `20260907156000_preauth_document_register_security_fix.sql`
- `20260907157000_preauth_audit_facility_security.sql`
- `20260907160000_preauthorization_submission_lifecycle.sql`
- `20260907170000_preauthorization_scope.sql`
- `20260908100000_preauth_handoff_security.sql`
- `20260908104000_disable_legacy_preauth_submission_execution.sql`
- `20260908113000_preauth_rpc_boundary_hardening.sql`
- `20260908121259_atomic_payment_import.sql`
- `20260908130000_core_facility_rls_hardening.sql`
- `20260908132000_core_facility_consistency_triggers.sql`
- `20260908134000_preauth_atomic_facility_item_fix.sql`
- `20260908135000_core_rls_policy_consolidation.sql`
- `20260908143000_claims_settlement_transition_hardening.sql`
- `20260908150000_settlement_exception_register.sql`
- `20260908174500_preserve_security_audit_targets.sql`
- `20260908180000_preserve_security_audit_actors.sql`
- `20260908204500_move_preauth_document_handoff_helpers_internal.sql`
- `20260909080000_harden_masterdata_rls_permissions.sql`
- `20260909200000_harden_preauth_client_lifecycle.sql`
- `20260909201000_harden_preauth_delete_boundary.sql`
- `20260910090000_system_administrator_global_access.sql`
- `20260910110000_system_administrator_facility_rls.sql`
- `20260910113000_system_admin_facility_select.sql`
- `20260910140000_restore_security_helper_execution.sql`
- `20260910143000_preauth_duplicate_lookup_index.sql`
- `20260910150000_restore_public_security_helper_execution.sql`
- `20260910183000_harden_preauthorization_idempotency.sql`
- `20260910230000_harden_rbac_rls.sql`
- `20260910232000_harden_rbac_authority.sql`
- `20260910232500_fix_rbac_policy_recursion.sql`
- `20260910233500_harden_sensitive_data_rls.sql`
- `20260910234500_enforce_rls_on_sensitive_tables.sql`
- `20260910235000_harden_audit_trigger_permissions.sql`
- `20260910240000_harden_security_definer_execution.sql`
- `20260911153000_document_ingest_deduplication.sql`
- `20260911170000_document_ingest_merge_hardening.sql`
- `20260911171500_document_ingest_merge_function_fix.sql`
- `20260911184000_document_ingest_wht_variable_hardening.sql`
- `20260921161000_fix_facility_rls_runtime_recursion.sql`
- `20261104085000_claim_diagnosis_assistant.sql`
- `20261120160000_settlement_exception_atomic_lifecycle.sql`

## Production ledger names without a direct repository filename match

- Ledger version `20260908182009`: `20260907132501_preauth_complete_fingerprint_name_compat`
- Ledger version `20260908182132`: `20260908120001_seed_role_permissions`
- Ledger version `20260908182223`: `20260908183000_harden_security_function_execution`
- Ledger version `20260908182238`: `20260908183500_lock_internal_security_definer_rpcs`
- Ledger version `20260908182250`: `20260908183600_harden_compat_fingerprint_search_path`
- Ledger version `20260908182301`: `20260908184000_database_performance_hardening`
- Ledger version `20260908182306`: `20260908184100_restore_tariff_rls`
- Ledger version `20260908182312`: `20260908184200_refine_tariff_access`
- Ledger version `20260908183358`: `restore_preauth_rpc_execute_grants`
- Ledger version `20260908194924`: `fix_preauth_document_hash_schema`
- Ledger version `20260908195225`: `harden_preauth_document_handoff_idempotency`
- Ledger version `20260908220926`: `add_missing_preauth_foreign_key_indexes`
- Ledger version `20260909075750`: `harden_masterdata_rls_permissions_v2`
- Ledger version `20260909160047`: `restore_preauth_rls_helper_execution`
- Ledger version `20260909200454`: `expose_preauth_transition_rpc_safely`
- Ledger version `20260911134711`: `relax_insurer_read_policy_for_operational_readers`
- Ledger version `20260911134721`: `remove_redundant_insurer_select_policy`
- Ledger version `20260921160938`: `fix_facility_policy_recursion_runtime`

## Duplicate repository timestamp groups

### `20260907140000`
- `20260907140000_preauth_atomic_hardening.sql`
- `20260907140000_preauth_versions_workflow_hardening.sql`

### `20260907144000`
- `20260907144000_preauth_document_integrity.sql`
- `20260907144000_preauth_document_lifecycle.sql`

### `20260907145000`
- `20260907145000_preauth_audit_events.sql`
- `20260907145000_preauth_workflow_transitions.sql`

## Required disposition

1. Preserve a verified full-system backup and complete a replacement-project restore rehearsal before schema work.
2. Recover the exact historical SQL source for each ledger row without a direct source match from repository history, prior branches, or the original deployment artifacts. Record the provenance and checksum.
3. For each repository-only migration file, establish whether it is unapplied, superseded, intentionally omitted, or already represented by a differently named/normalized ledger entry.
4. Inspect the three duplicate version groups and the actual production definitions of their overlapping tables/functions. Do not assume that the file with the matching name is the only source that affected the schema.
5. Build an explicit ordered mapping from each source migration to the production ledger version and resulting schema objects.
6. Test the reconciled sequence against both a clean disposable database and a restored copy of production.
7. Only after these steps, prepare forward-only corrective migrations or a documented migration repair plan. Never rewrite or rename an applied migration identity.

## Safety boundary

This report was generated from GitHub's repository tree and the Supabase migration-list API. No SQL was executed against the database, and no production data, schema, migration ledger, Auth settings, grants, RLS policies, or indexes were changed. No paid Supabase branch or project was created.
