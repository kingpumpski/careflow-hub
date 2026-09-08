# CareFlow Hub — Global Claims Platform Standards

## Product mandate

CareFlow Hub is being developed as a globally deployable insurance-claims operations platform, not as a Ghana-only hospital billing application. Ghana remains the first reference market, but country-specific rules must be configurable rather than embedded in the core domain.

## Non-negotiable architecture principles

1. **Claims-first domain model** — model the insurance claim lifecycle as a first-class domain with immutable financial events, status transitions, adjustments, adjudication outcomes and reconciliation.
2. **Multi-tenant by design** — every business record must have an explicit tenant/organization boundary before production multi-company deployment.
3. **Configuration over hard-coding** — currency, locale, tax, payer rules, claim numbering, submission channels, coding systems and regulatory settings belong to organization/jurisdiction configuration.
4. **Least privilege** — authentication is not authorization. Database RLS is the final enforcement boundary; UI permissions are only a usability layer.
5. **Financial integrity** — money is stored as fixed-precision numeric values, never floating-point calculations. Ledger postings must balance and financial records must be auditable.
6. **Immutable auditability** — claims, payments, adjustments, approvals, denials and ledger events require actor, timestamp, reason and before/after evidence where applicable.
7. **Interoperability** — design adapters around standard healthcare/insurance coding and exchange formats. The core must not depend on a single payer or country API.
8. **Privacy by default** — minimize PHI/PII, separate operational identifiers from analytics, and never expose privileged service credentials to browsers or AI clients.
9. **Human-in-the-loop AI** — AI may summarize, prioritize, detect anomalies and recommend actions; it must not silently adjudicate or alter financial/clinical records.
10. **Testable domain logic** — calculations and lifecycle transitions must be framework-independent and covered by deterministic unit tests before UI integration.

## Internationalization baseline

The core platform must support:

- ISO 4217 currency codes and organization-specific currency formatting.
- ISO 3166-1 country codes.
- IANA time zones.
- Locale-aware dates, numbers and calendars.
- Configurable tax and withholding rules.
- Configurable claim numbering schemes.
- Configurable payer/provider identifiers.
- Configurable coding systems such as ICD-10 and future code-system adapters.
- Configurable submission/reconciliation integrations.

The existing Ghana Cedi presentation is treated as a deployment configuration, not a core invariant.

## Claims lifecycle target

`draft → verified → submitted → acknowledged → under_review → queried → approved → partially_approved → rejected → appealed → partially_paid → paid → reconciled → closed`

Transitions must be explicit, validated and audited. A UI control must never be able to manufacture an invalid lifecycle state.

## Financial domain target

Separate these concepts:

- claim gross amount
- approved/adjudicated amount
- rejected amount
- contractual adjustment
- patient responsibility, where applicable
- payer payment
- withholding/tax deduction
- other adjustment
- outstanding receivable
- reconciliation variance

Do not infer accounting truth from UI totals. Persist source transactions and derive reporting views from them.

## Security baseline

- No tracked `.env` files.
- No service-role keys in client bundles.
- Authenticated Edge Functions by default.
- RLS on every exposed table.
- Role checks in protected database functions/policies.
- Immutable audit logs for financial and claims events.
- No client-side authorization as the final security boundary.
- Security and performance advisor checks after material schema changes.

## AI governance

Aidah must receive only the minimum data required for the user's authorized task. AI output must be clearly identified as generated assistance. Recommendations affecting claim payment, denial, fraud, compliance or financial reporting require human confirmation and an auditable action trail.

## Definition of done for every phase

A phase is not complete until:

- domain logic is implemented and tested;
- database migrations are versioned and reversible where practical;
- RLS/grants are reviewed;
- TypeScript types are synchronized;
- lint, unit tests and production build pass;
- relevant E2E flows pass;
- documentation and release notes are updated;
- the repository is clean and the commit is traceable to one coherent change.
