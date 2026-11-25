# CareFlow Hub — Cross-Module Modernization Roadmap

## Purpose

This roadmap turns `docs/GLOBAL_STANDARDS.md` into an executable programme. The objective is to improve every module through shared domain services, reliable financial algorithms, explicit workflow contracts, least-privilege authorization, measurable performance and consistent user experience—not isolated UI redesigns.

This is a staged programme. A capability is not considered complete because a screen or client-side helper exists; it must be enforced at the authoritative service/database boundary and have regression evidence.

## Current implementation snapshot

| Area | Existing foundation | Remaining work |
|---|---|---|
| Financial reporting | PR #84 adds branded print output, insurer selection, print-only removal of interactive sort icons and restricted letterhead settings access | Merge only after full CI and disposable PostgreSQL tests; verify configured company identity values in the target environment |
| Facility administration | PR #84 moves Facilities & Access into Administration and restricts route, navigation, RPC and membership-roster access to superusers | Complete database replay, review and controlled release; do not infer production deployment from source changes |
| Claims | Canonical lifecycle catalogue and separate monthly aggregate claims model | Enforce individual claim-case transitions through transactional server-side RPCs; reconcile the separate claim-case implementation before merge |
| Settlement and WHT | Authoritative claim-period and receipt-month reporting views; actual and provisional WHT are distinguished | Complete exception lifecycle, partial/multiple remittance allocation, reversals, and end-to-end month-to-month reconciliation tests |
| Platform configuration | Country, currency, locale and time-zone defaults are centralized | Complete organization-level configuration and eliminate country/currency assumptions from remaining domain services |
| Financial precision | Database financial fields use fixed-precision numeric types in the intended model | Audit JavaScript calculations and exports for binary floating-point rounding; centralize currency-aware decimal arithmetic before expanding financial workflows |
| Authorization | Role/permission model, RLS, server-side privileged operations and facility scoping | Implement organization-level tenancy and cross-tenant negative tests; continue reducing unnecessary SECURITY DEFINER exposure |
| Offline operations | Durable offline storage and synchronization queue exist for supported workflows | Add deterministic conflict resolution, idempotent replay, retry/backoff, dead-letter visibility and operator recovery |
| AI assistance | Server-side provider abstraction and human-review policy | Add auditable recommendation provenance, confidence/limitations, data minimization and explicit confirmation for consequential actions |

## Delivery phases

### Phase 1 — Financial domain integrity

- Create one shared currency-aware money calculation service using decimal-safe arithmetic; do not use JavaScript floating-point addition for authoritative totals.
- Define currency precision from ISO 4217 configuration rather than assuming every currency has two decimal places.
- Centralize claim gross, approved gross, rejected amount, approval variance, net cash, actual WHT, provisional WHT, adjustments and outstanding calculations.
- Keep source events immutable; derive balances and reports from authoritative records/views.
- Add property-based or invariant tests: ledger debits equal credits, no negative allocations unless explicitly represented as reversals, and report totals reconcile to source rows.
- Verify exports use the same calculation results as on-screen reports.

### Phase 2 — Workflow and transaction integrity

- Use explicit state-machine transition catalogues for claims, pre-authorizations, settlements, exceptions, document intake and approvals.
- Enforce transitions server-side with authorization, facility/organization scope, row locking and optimistic version checks.
- Require idempotency keys for externally retried creates, imports, postings and remittance ingestion.
- Record immutable actor, timestamp, reason, source reference and before/after evidence for material transitions.
- Reject invalid transitions instead of silently normalizing them in the UI.

### Phase 3 — Month-to-month settlement and reconciliation

- Match monthly aggregate claims to insurer advice and actual remittance events without rewriting the originating claim month.
- Support partial payments, multiple remittances, rejected balances, actual WHT, provisional WHT, reversals and over/under-payment.
- Allocate each remittance to explicit claim periods and retain the actual receipt date/month independently.
- Create auditable exceptions for unmatched, short-paid, over-paid, duplicate or contradictory advice.
- Close a cycle only when its configured reconciliation conditions are satisfied; otherwise keep the variance visible and actionable.

### Phase 4 — Organization tenancy and security

- Introduce organization identity and active-organization context separately from facility membership.
- Add organization scope to business records, server-side authorization and RLS policies.
- Test cross-organization reads, writes, exports, realtime events, offline replay and AI retrieval as negative cases.
- Keep superuser facility administration distinct from organization administrators and ordinary operational users.
- Review grants, RPC execution rights, SECURITY DEFINER search paths and exposed views after each schema change.

### Phase 5 — Interoperability and data quality

- Use adapters for payer integrations, claims submission, remittance advice, document exchange and coding systems.
- Validate imports with versioned schemas, normalized identifiers, duplicate fingerprints and conflict reports.
- Preserve original source files, extraction evidence and reviewer decisions where retention policy permits.
- Do not let AI or import automation silently overwrite verified financial or clinical facts.

### Phase 6 — Performance, resilience and usability

- Measure query latency, page load, export duration, realtime volume and offline recovery time.
- Add indexes only from observed query plans and representative workload; remove indexes only after usage validation.
- Use server-side pagination/filtering for large tables and bounded queries for dashboards.
- Apply accessible interaction patterns, keyboard navigation, responsive layouts and consistent empty/loading/error states.
- Use shared design tokens, formatting utilities and reusable report/export templates across modules.

### Phase 7 — Governed AI and operational intelligence

- Limit model context to the minimum data authorized for the active task.
- Separate deterministic calculations from generated summaries and recommendations.
- Record model/provider, prompt/version, input references, output, user confirmation and downstream action where appropriate.
- Require human approval for clinical, financial, fraud, compliance and authorization decisions.
- Monitor quality, latency, cost, drift and false-positive/false-negative rates.

## Definition of done for every module

A module or workflow is complete only when all applicable items are satisfied:

1. Business rules are documented and implemented in a reusable domain service.
2. Money, dates, currencies and time zones use configured standards.
3. Authorization is enforced by the backend/database, not only by route visibility.
4. Mutations are transactional, idempotent where retries are possible, and auditable.
5. Data contracts and generated types match the deployed schema.
6. Unit, integration, negative-authorization and end-to-end tests cover important paths.
7. Performance is measured on realistic data volumes.
8. Exports and dashboards reconcile to the same authoritative data.
9. Accessibility, responsive behavior, loading/error states and recovery paths are verified.
10. Documentation, release gates and rollback/recovery notes are updated.

## Release boundary

PR #84 is a bounded release slice for financial reporting and superuser-only facility administration. It does not complete the cross-module programme. Organization tenancy, decimal-safe calculation centralization, full settlement-exception lifecycle, individual claim-case production rollout, broad performance work and restore rehearsal remain separate gates. No production database deployment is implied by this roadmap or by an open pull request.
