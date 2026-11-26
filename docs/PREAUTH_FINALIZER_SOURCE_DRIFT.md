# Pre-Authorization finalizer: source and production drift audit

**Status: release-blocking; read-only investigation only.** This record supersedes earlier statements that the current finalizer source consistently targets the canonical prepared-handoff table.

## Approved product contract

The Pre-Authorization Studio prepares an immutable document revision and an email package for an officer to review and send through the facility's normal channel. A successful finalization records preparation/handoff only. It must not imply that an email was sent or delivered, that an insurer received it, or that an insurer approved it. Insurer-side response tracking and the legacy insurer execution queue are out of scope.

The intended prepared-handoff relation is `public.preauthorization_submissions`. Its source migration initially defines a `prepared`-only lifecycle. The separate `public.preauth_submissions` relation is a legacy queue-shaped execution register and must not be reused for the document-preparation workflow. The distinct misspelling `public.pre_auth_submissions` is not a valid relation name.

## Verified source-tree finding

Inspection of the current main branch at merge commit `4f83ed39dada046770ae10ac7e0dc8616cf014d4` found:

- `20260907160000_preauthorization_submission_lifecycle.sql` creates `public.preauthorization_submissions`, with a prepared-first lifecycle and recipient/attachment manifests.
- `20260907170000_preauthorization_scope.sql` constrains that relation to `status = 'prepared'` and removes insurer-delivery/response columns.
- Later finalizer migrations `20260910170000_restore_preauthorization_finalize_handoff.sql`, `20260910172000_harden_preauth_finalize_duplicate_concurrency.sql`, and `20260910183000_harden_preauthorization_idempotency.sql` instead read/write the legacy `public.preauth_submissions` relation and insert `status = 'queued'`. The final migration also retains a row type for that legacy table.
- `supabase/tests/preauth_submission_idempotency.test.sql` incorrectly calls `public.preauth_submissions` canonical and only rejects `public.pre_auth_submissions`. It does not enforce the intended `public.preauthorization_submissions` relation or prepared-only status.
- Consequently, the current source test gives false confidence and does not protect the product boundary.

These are repository source findings, not proof of which SQL bytes were originally applied to production.

## Verified production catalog finding (SELECT-only)

A read-only catalog query against the owner-confirmed project `jajfdgknctzqypdtvmxo` returned:

| Object | Present |
|---|---:|
| `public.preauthorization_submissions` | No |
| `public.preauth_submissions` (legacy queue) | Yes |
| `public.pre_auth_submissions` (misspelling) | No |
| `security_internal.finalize_preauthorization_handoff(...)` | Yes |

The live private finalizer body reads `public.preauth_submissions` for idempotency, but its new-row INSERT targets the nonexistent `public.pre_auth_submissions` and sets `status = 'queued'`. The public wrapper delegates to this private function. Therefore a new finalization attempt is not compatible with the live catalog and, independently, the queue status violates the approved prepared-handoff-only contract.

The same read-only snapshot reconfirmed independent production blockers:

- Missing settlement exception tables and RPCs.
- Missing remittance table/RPC and receipt-month view.
- Missing claim-case tables and lifecycle RPCs.
- `claims_settlement_periods` lacks `approved_gross_amount` and `actual_receipt_date`.
- `facilities` and `facility_memberships` both contain zero rows.
- `claims_officer` lacks `claims.settlement.read` and `claims.settlement.write`; `accounts_officer` retains `payments.read/write`.

No production DDL, data, migration-ledger, permission, Auth, or Edge Function changes were made.

## Required correction sequence

1. Recover and complete the semantic production migration crosswalk. The migration ledger stores names, not SQL bodies; do not infer historical equivalence from filenames.
2. Complete the already-required encrypted backup and separate-project restore rehearsal. Do not bypass the paused backup work.
3. Reconcile the finalizer's exact table/column contract against both the production catalog and the intended `preauthorization_submissions` schema.
4. Prepare a reviewed forward-only correction that writes only a `prepared` record to `public.preauthorization_submissions`, preserves immutable revision and idempotency behavior, and does not call insurer queue/process/complete/fail functions.
5. Add SQL regression tests that explicitly require `public.preauthorization_submissions`, reject both `public.preauth_submissions` and `public.pre_auth_submissions` in the finalizer, and reject `queued` or other insurer-delivery states.
6. Test the complete sequence from empty database and against a restored production copy, including facility authorization, duplicate concurrency, idempotent retry, payload mismatch, and prepared-only semantics.
7. Only after review and explicit release authorization may a production migration be considered.

Do not edit historical migrations, repair the migration ledger, create a replacement table directly in production, deploy the Edge Function, or run `supabase db push --linked` as a shortcut.
