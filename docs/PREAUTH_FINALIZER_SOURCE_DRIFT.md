# Pre-Authorization finalizer: source and production drift audit

**Status: source correction merged; production release remains blocked.** This document supersedes the earlier source-tree finding below that described the canonical prepared-handoff relation and test as missing. The historical production observations are retained as read-only evidence and must not be mistaken for the current repository implementation.

## Approved product contract

The Pre-Authorization Studio prepares an immutable document revision and an email package for an officer to review and send through the facility's normal channel. A successful finalization records preparation/handoff only. It must not imply that an email was sent or delivered, that an insurer received it, or that an insurer approved it. Insurer-side response tracking and the legacy insurer execution queue are out of scope.

The intended prepared-handoff relation is `public.preauthorization_submissions`. The separate `public.preauth_submissions` relation is a legacy queue-shaped execution register and must not be reused for document preparation. The distinct misspelling `public.pre_auth_submissions` is not a valid relation name.

## Current repository implementation

The source correction was merged in PR #122 (merge commit `451eeca1930853ab00ee1d2fde9a507a6ec452e1`):

- Migration `20261126150000_restore_prepared_preauthorization_handoff_contract.sql` creates/restores `public.preauthorization_submissions` as a prepared-only handoff register.
- The private finalizer writes the canonical prepared-handoff relation and preserves immutable version, document registry, handoff log and idempotency behavior.
- It does not use either the legacy queue relation or the misspelled relation, and it does not create insurer submission, delivery or approval states.
- `supabase/tests/preauth_submission_idempotency.test.sql` requires the canonical relation, rejects both noncanonical relation names, and enforces prepared-only semantics.
- PR #122 passed CI, CareFlow Quality Gate, Dependency Security Audit and disposable PostgreSQL migration replay/SQL contract tests on its exact head.

The exposed wrapper was further hardened in PR #124 (merge commit `31670fff909450af28f7f45099045bc0cc8cec14`):

- `public.finalize_preauthorization_handoff(...)` is now `SECURITY INVOKER`, with an empty `search_path`.
- Authenticated execution is retained; `PUBLIC` and `anon` execution are revoked.
- The permission-checked private `security_internal.finalize_preauthorization_handoff(...)` remains the privileged implementation. Its ACL revokes `PUBLIC` and `anon`, retaining authenticated execution for the invoker wrapper.
- SQL contract tests assert wrapper mode, pinned search path and both wrapper/private function grants.
- PR #124 passed CI, CareFlow Quality Gate, Dependency Security Audit and full disposable PostgreSQL migration replay/SQL contract tests.

PR #125 updates the read-only production preflight diagnostic to expect the new SECURITY INVOKER wrapper contract. It is a diagnostic-only follow-up and remains subject to its own checks before merge.

## Historical production catalog finding (SELECT-only; not yet revalidated after source merge)

The read-only production inspection on 2026-11-26 returned:

| Object | Present |
|---|---:|
| `public.preauthorization_submissions` | No |
| `public.preauth_submissions` (legacy queue) | Yes |
| `public.pre_auth_submissions` (misspelling) | No |
| `security_internal.finalize_preauthorization_handoff(...)` | Yes |

The observed live private finalizer body contained an INSERT into the nonexistent `public.pre_auth_submissions` and used legacy queue status semantics. This is static evidence of a production/source mismatch; no user-facing RPC was invoked and no write was attempted.

**The repository correction has not been applied to production.** The live function and catalog must be re-inspected after a verified backup/restore and complete migration crosswalk. Do not assume that merging the source migration changes the hosted database.

## Independent production blockers

The same read-only production review found:

- Settlement exception tables and lifecycle RPCs are absent.
- Remittance ledger, receipt-month view and related RPCs are absent.
- Claim-case tables and lifecycle RPCs are absent.
- `claims_settlement_periods` lacks `approved_gross_amount` and `actual_receipt_date`.
- `claims_officer` lacks `claims.settlement.read` and `claims.settlement.write`.
- `facilities` and `facility_memberships` exist but both contain zero rows.
- The live migration ledger and source migration history still require a semantic crosswalk; duplicate timestamp groups must not be resolved by arbitrary renaming.

## Required release sequence

1. Complete and verify the encrypted full-system backup and separate-project restore rehearsal.
2. Complete the semantic crosswalk between the live migration ledger, historical applied SQL and current source migrations.
3. On the restored copy, replay and verify the finalizer's complete transaction: permission and facility boundaries, immutable revision, document registry, handoff audit, idempotency, duplicate concurrency, payload mismatch and prepared-only semantics.
4. Verify settlement, remittance, reversal, receipt-month and claim-case migrations against realistic multi-role and cross-month scenarios.
5. Re-run the read-only production preflight and reconcile every BLOCKED/REVIEW result.
6. Only after review and explicit release authorization may a controlled production deployment be considered.

Do not edit historical migrations, repair the live migration ledger, create replacement tables directly in production, deploy Edge Functions independently of their schema contract, or run `supabase db push --linked` as a shortcut.
