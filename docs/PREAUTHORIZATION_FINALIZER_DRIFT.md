# Pre-Authorization finalizer: canonical handoff contract and production drift

**Status:** implementation/release blocker; production inspection is read-only  
**Reviewed:** 2026-11-26

## Product contract

The Pre-Authorization module prepares a facility document package. Its supported path is:

1. Capture and validate request details and itemised charges.
2. Freeze an immutable revision.
3. Generate and register the PDF.
4. Prepare recipient and attachment manifests, subject and email body.
5. Record the package as **prepared** for an officer to review and send through the facility's normal channel.

A prepared package is not proof of external sending, delivery, insurer receipt or insurer approval. Internal facility review/approval must remain distinct from an insurer decision.

## Two similarly named tables with different purposes

The source migrations distinguish these relations:

- `public.preauth_submissions`: legacy insurer-submission execution register. Migration `20260908104000_disable_legacy_preauth_submission_execution.sql` explicitly retains it for historical compatibility only and revokes authenticated write access. Its old schema contains queue-oriented fields such as `queued`, `failed`, retry counters and next-attempt timestamps. Do not use it as the new document handoff register or re-enable its queue/process/complete/fail RPCs.
- `public.preauthorization_submissions`: the prepared document/email-handoff register created by `20260907160000_preauthorization_submission_lifecycle.sql`. The later `20260908113000_preauth_rpc_boundary_hardening.sql` constrains its status to `prepared` only and uses it for idempotent finalisation. This is the intended product boundary.

The name `public.pre_auth_submissions` is a third, misspelled relation. It is not the canonical name of either table and must not be introduced to make a broken function work.

## Source-level regression

The source migration `20260908113000_preauth_rpc_boundary_hardening.sql` contains a document-first finalizer that:
- reads/writes `public.preauthorization_submissions`;
- inserts a `prepared` record;
- checks idempotency against the immutable version snapshot;
- records a prepared handoff and updates the parent state to “Email handoff prepared”.

Later source migrations `20260910170000_restore_preauthorization_finalize_handoff.sql`, `20260910172000_harden_preauth_finalize_duplicate_concurrency.sql`, and `20260910183000_harden_preauthorization_idempotency.sql` replace that contract with a private helper which writes to legacy `public.preauth_submissions` using status `queued`. The finalizer's SQL contract test currently checks for `preauth_submissions`, so it does not protect the intended table distinction.

This is a source-history regression. Do not edit historical migration files that may already be represented in the production ledger. A new forward-only correction must be generated after the full migration crosswalk, recovery gate, and disposable/restored-copy tests are complete.

## Read-only production findings

The connected production project was inspected using catalog SELECTs only:

- `public.preauth_submissions` exists with legacy queue-shaped columns, including `status` defaulting to `queued`, `retry_count`, `completed_at`, `external_reference` and `provider_message`.
- `public.preauthorization_submissions` was not returned by the production column inventory.
- `public.pre_auth_submissions` does not exist.
- The live private finalizer body references `public.pre_auth_submissions` and contains the concurrency guard, while its current checked-in source counterparts use `public.preauth_submissions`. The live function therefore diverges from both the current source text and the intended prepared-only handoff contract.
- The live migration ledger contains the restore/concurrency finalizer entries, but not the later `20260910183000_harden_preauthorization_idempotency` entry. This is not sufficient by itself to explain the live body mismatch; the exact original applied SQL remains unknown.

No RPC was invoked. No production DDL, data, migration ledger, Auth, Edge Function or deployment change was made.

## Release blockers and safe sequence

1. Preserve this distinction in source tests and diagnostics: finalizer must reference `public.preauthorization_submissions`, must not reference either legacy/misspelled table, and must only create a `prepared` handoff.
2. Reconcile the exact live schema, function definitions, grants, policies and all 74 migration-ledger rows against source history.
3. Complete the required encrypted backup and successful restore rehearsal to a separate project.
4. Generate a new forward-only migration through the Supabase CLI after the crosswalk is approved; do not edit historical migrations or hand-edit the live ledger.
5. Test the complete transaction on a restored/disposable copy: facility boundary, immutable snapshot, document registry, recipient/attachment manifests, idempotency replay/conflict, audit and prepared-only status.
6. Only then schedule a separately reviewed production release.

Never run `supabase db push --linked` while these gates are open. Do not restore insurer-side queue processing, retry workers, insurer response tracking, delivery states or insurer approval functionality.
