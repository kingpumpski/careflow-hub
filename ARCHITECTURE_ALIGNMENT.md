# RAP Module — Architecture Alignment

**Repository:** `kingpumpski/careflow-hub`  
**Branch:** `feature/rap-module`  
**Target:** `v2.1.0-rap` / release `v2.1.0`  
**Status:** Step 2 database design complete; implementation remains isolated and feature-off.

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

AI can suggest, rank, explain, draft, and escalate. It cannot replace deterministic selection or submit to partners. Confidence below `0.85` automatically escalates to human review.

## HITL

Every mutation/finalization is gated by a single-use HMAC approval token bound to user, action, payload hash, and expiry. Missing, expired, replayed, or payload-mismatched tokens are rejected and audited.

## Data sovereignty

Raw PHI must remain on Ghana-hosted infrastructure. RAP will not send PHI to foreign APIs. Model adapters must verify hosting location and residency before invocation. IT Officer egress is isolated through an allow-list proxy and cannot receive PHI/PII/internal identifiers/secrets.

## Database boundary

All RAP objects use the `rap_` prefix within the isolated `rap` schema. RAP-owned foreign keys are restrictive; no cascading lifecycle is permitted. Core identifiers are adapter-owned read-only references until exact core table contracts are approved. Governance/audit/event tables are append-only and reject UPDATE/DELETE at the database trigger boundary.

The database design is deliberately kept out of the active production Supabase migration chain during this stage. Activation will require a separate migration review, RLS review, residency evidence, and human approval.

## Document boundary

XLSX/XLS/CSV/TSV are first-class. Original bytes remain immutable. Rendering changes only the target diagnosis column and applies formula-injection protection. PDF/DOCX/image processing is a fallback path. No macro execution or arbitrary code execution is permitted.

## Integration constraints

1. Existing notification service must be identified and reused.
2. Existing claims/pre-authorization read interfaces must be mapped before adapters are implemented.
3. Existing security permission catalogue must be reused.
4. Supabase RLS and deployment conventions must be reviewed before activating migrations.
5. Ghana DPC registration, Data Protection Supervisor, DPIA, CII designation, residency and CSP facts are governance gates and cannot be fabricated by code.

## Review gates

Step 1: reconnaissance — complete.  
Step 2: database design + ERD — complete on `feature/rap-module`; **human review required before Step 3**.  
No production data has been changed and no RAP feature has been enabled.
