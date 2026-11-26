# Pre-Authorization Architecture

CareFlow Hub's Pre-Authorization Studio is designed as a reusable operational capability for healthcare facilities, clinics, hospitals and claims teams in different jurisdictions.

## Core rules

1. **Client identity is text-first.** A request can be created without a master patient record.
2. **Insurer identity is request-specific.** A client suggestion never permanently owns or selects an insurer.
3. **Client suggestions are convenience memory.** They are facility-scoped and may be reused for a later procedure.
4. **Facility is the tenant boundary.** A user must have an active facility membership before creating or amending a request.
5. **Charges are server-authoritative.** The database validates quantities/unit prices and recalculates the total.
6. **Duplicate detection is authoritative on the server.** Client-side checks are advisory only.
7. **Versions are immutable.** A generated document references an exact request version and its snapshot.
8. **Document finalisation is idempotent.** `(preauth_id, idempotency_key)` prevents duplicate preparation of the same immutable document/email handoff package.
9. **Handoff is not insurer submission.** The module records that a PDF/email package was prepared and opened for the officer; it does not claim external sending, delivery, insurer receipt or insurer approval.
10. **Configuration is jurisdiction-neutral.** Currency, timezone, date format and facility settings belong to facility configuration rather than application constants.

## Facility onboarding

A deployment should create a facility, create active `facility_memberships` for its operators, and then allow the Pre-Authorization Studio to select the operator's active facility. Historical requests without a facility must be explicitly backfilled before a deployment can enforce `NOT NULL` at the database level.

## Document integrity

PDF rendering reads `preauthorization_versions.snapshot`, not the mutable request tables. The resulting binary is hashed with SHA-256 and registered against the exact `(preauth_id, version_number, document_type, format)` tuple.

## Extension points

The model deliberately leaves room for:

- optional future handoff integrations, only if separately approved;
- facility-specific email-client handoff configuration;
- facility-specific templates and branding;
- regional currency and date conventions;
- configurable review/approval rules;
- provider and department scoping;
- retention and archival policies;
- claims, billing and adjudication integrations.

These integrations must not weaken the facility, version, idempotency or audit boundaries defined above.


## Product boundary

The Pre-Authorization Studio helps facility users prepare accurate, professional authorization-request documents. It is not the primary authorization submission system or the insurer's system of record.

The core workflow is request data capture, validation, itemised charge calculation, immutable document revision, PDF generation, and preparation of an email package for the officer to review and send through the facility's normal channel. A prepared handoff is not proof of external submission or delivery.

Insurer decisions and lifecycle data—including approval/decline, partial authorization, authorization numbers, validity dates, insurer follow-ups and response reconciliation—belong outside this module. A facility's own internal review/approval step must be labelled and treated separately from an insurer decision.

The legacy `preauth_submissions` execution pipeline is disabled by later migrations. Keep it distinct from the supported `preauthorization_submissions` prepared-email-handoff record. Do not re-enable the legacy queue/process/complete/fail RPCs as part of document-generation work.
