# RAP Design

RAP (Rejection Advice Processing) is an isolated, feature-flagged module for deterministic rejection-advice processing with optional AI assistance.

## Boundary

- RAP lives under `modules/rap`.
- Core CareFlow code does not import RAP.
- Host integrations are dependency-inverted through `modules/rap/adapters/contracts.ts`.
- RAP has no UI, router, auth provider, notification implementation, or persistence implementation of its own.

## Processing order

1. Validate feature flag and document limits.
2. Parse XLSX/XLS/CSV/TSV into an immutable structured representation.
3. Extract claim-item fields.
4. Apply deterministic knowledge-base diagnosis matching.
5. Emit a decision trace for every item.
6. Produce a draft-only rendered document restricted to the target column.
7. Require human approval before mutation/export/submission.
8. Persist audit/retention events through host-owned adapters.

## AI safety

AI can rank, explain, summarize, or draft. It cannot replace deterministic matching or directly mutate business records. Confidence below 0.85 is escalated to a human. Every mutation requires a single-use approval token bound to user, action, payload hash and expiry.

Three isolated personas are defined in `agent/personas.yaml` and implemented as policy boundaries in `agent/policy.ts`.

## Data protection

Raw PHI/PII/secrets/internal identifiers are prohibited from foreign processing. The IT persona alone may use controlled external egress and only for allowlisted security research. Cross-border non-PHI processing requires documented approval.

## Retention

Retention resolution is deterministic: explicit override, partner policy, claim type, global default, then legal minimum. Compression/deletion orchestration is idempotent and legal-hold aware. Binary deletion may leave structured JSON according to configured retention.

## Current implementation status

The module currently contains the deterministic pipeline, safety contracts, governance boundaries, retention orchestration contracts, and adapter contracts. Concrete Supabase persistence, host notification binding, approval-token issuance endpoint, isolated IT egress worker, and binary-preserving workbook exporter remain integration steps because they require reconciliation with the current production architecture and runtime environment.
