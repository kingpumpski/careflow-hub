# RAP Module — Architecture Alignment

**Repository:** `kingpumpski/careflow-hub`  
**Branch:** `feature/rap-module`  
**Target:** `v2.1.0-rap` / release `v2.1.0`  
**Status:** Step 3 deterministic core implemented and expanded; runtime activation remains feature-off.

## Architectural decision

RAP is a repository-root isolated module under `modules/rap/`. It does not extend or replace the existing claims, rejection, pre-authorization, security, AI, notification, or application-shell implementations. Core-to-RAP communication will occur only through reviewed interfaces/events and thin adapters.

The existing application uses React/TypeScript/Vite, React Router, TanStack Query, centralized authentication and permission boundaries, Supabase integration, and an existing AI provider abstraction. RAP will reuse those capabilities only through explicit contracts and will not create duplicate providers, routers, notification systems, authentication, or permission models.

## Dependency direction

```text
CareFlow core
   │
   │ existing service/event interfaces
   ▼
RAP adapters ──► RAP deterministic core ──► RAP agent/retention
                       │
                       └── HITL approval boundary

Core ──X──> RAP
```

The master flag and all child flags are OFF by default:

```text
RAP_ENABLED=false
RAP_RETENTION_ENABLED=false
RAP_AGENT_CLAIMS_ENABLED=false
RAP_AGENT_ADMIN_ENABLED=false
RAP_AGENT_IT_ENABLED=false
```

## Deterministic core

Diagnosis matching is pure deterministic logic. It does not call an LLM. Candidate diagnoses are gathered from approved read-only sources, filtered against RAP mappings and applicability, ranked using support type/mapping confidence/specificity/recency/partner precedence, and emitted with a `DecisionTrace`. No match becomes `UNRESOLVED` and escalates.

The implementation now also enforces stable tie-breaking and duplicate candidate normalization. REQUIRED diagnoses are retained together; SUPPORTING diagnoses require explicit partner precedence. This prevents ordering-dependent decisions.

AI can suggest, rank, explain, draft, and escalate. It cannot replace deterministic selection or submit to partners. Confidence below `0.85` automatically escalates to human review.

## Document pipeline boundary

XLSX/XLS/CSV/TSV are first-class. CSV/TSV parsing is deterministic and rejects malformed quoted fields. XLSX/XLS parsing normalizes every worksheet through the same tabular contract while retaining worksheet identity. Empty numeric values remain undefined rather than being coerced to zero.

Rendering is a pure structural operation. It can be constrained to one target column, rejects duplicate cell targets, rejects out-of-bound cells, and guards string values beginning with `=`, `+`, `-`, or `@` against spreadsheet formula injection. Binary serialization, original-byte storage, style preservation, and final export remain separate adapter/storage responsibilities and are not silently claimed by the pure core renderer.

## HITL

Every mutation/finalization is gated by a single-use HMAC approval token bound to user, action, payload hash, and expiry. Missing, expired, replayed, or payload-mismatched tokens are rejected and audited.

## Data sovereignty

Raw PHI must remain on Ghana-hosted infrastructure. RAP will not send PHI to foreign APIs. Model adapters must verify hosting location and residency before invocation. IT Officer egress is isolated through an allow-list proxy and cannot receive PHI/PII/internal identifiers/secrets.

## Database boundary

All RAP objects use the `rap_` prefix within the isolated `rap` schema. RAP-owned foreign keys are restrictive; no cascading lifecycle is permitted. Core identifiers are adapter-owned read-only references until exact core table contracts are approved. Governance/audit/event tables are append-only and reject UPDATE/DELETE at the database trigger boundary.

The database design is deliberately kept out of the active production Supabase migration chain during this stage. Activation will require a separate migration review, RLS review, residency evidence, and human approval.

## Integration constraints

1. Existing notification service must be identified and reused.
2. Existing claims/pre-authorization read interfaces must be mapped before adapters are implemented.
3. Existing security permission catalogue must be reused.
4. Supabase RLS and deployment conventions must be reviewed before activating migrations.
5. Ghana DPC registration, Data Protection Supervisor, DPIA, CII designation, residency and CSP facts are governance gates and cannot be fabricated by code.

## Test discovery reconciliation

The repository's existing Vitest configuration originally discovered only `src/**` tests. RAP tests live under the intentionally isolated `modules/rap/**` boundary, so the test include was expanded to discover both existing application tests and RAP tests. No dependency upgrade was made.

## Review gates

Step 1: reconnaissance — complete.  
Step 2: database design + ERD — complete.  
Step 3: deterministic KB + parser + matcher + renderer — implemented and expanded.  
Step 3 runtime validation — **pending execution inside the repository Codespace**.  
Step 4: retention + existing notification-service integration — not started.

No production data has been changed and no RAP feature has been enabled.
