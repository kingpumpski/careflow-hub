# RAP Hardening & Delivery Blueprint

Status: design guide plus isolated deterministic domain/pipeline implementation in progress. Current code is under src/modules/rap and has dedicated unit tests and a branch-scoped CI workflow. CI results must be green before considering this stage verified. This work does not enable RAP, add production migrations, or permit production writes.

## 1. Integration boundaries

- Keep RAP behind `RAP_ENABLED=false` by default and behind a server-side feature gate; hiding a route in the UI is not authorization.
- Keep the module isolated under `modules/rap` and use explicit host ports/adapters for identity, persistence, audit, reference data, notifications, and handoff.
- Do not introduce duplicate auth, notification, or audit systems. Reuse host contracts through narrow interfaces.
- Keep Supabase schema changes in reviewed, isolated RAP migrations until tenant mapping, RLS tests, rollback and operational ownership are approved.
- The existing offline-first operational store remains usable when remote services are unavailable. Do not queue irreversible payer submissions as generic upserts.

## 2. Security invariants (release blockers)

1. **Tenant isolation:** derive tenant/facility identity from verified server-side identity and membership, never from request-body claims. Every RAP read and write is tenant-scoped. Deny when tenant context is missing.
2. **Authorization:** enforce permission + tenant + resource ownership + lifecycle state at service boundaries and in database RLS. UI permissions are presentation only.
3. **Fail-closed transitions:** a session with unresolved BLOCKER/ERROR findings cannot become READY, EXPORTED or SUBMITTED. Enforce in both domain transition code and database constraints/transition RPCs.
4. **Immutable evidence:** after validation, preserve the exact canonical payload, rule-set version, findings, content digest, signer key ID and timestamps as a sealed revision. Corrections create a new revision; they do not rewrite signed evidence.
5. **Audit integrity:** append audit events for successful and rejected high-impact operations. Restrict mutation privileges and periodically verify hash-chain continuity. A hash chain in one database is tamper-evident, not independently immutable; mirror checkpoints to separately controlled storage before claiming WORM evidence.
6. **Idempotency:** scope keys by tenant + operation + actor/session; persist the request digest and final outcome transactionally. Reusing a key with a different digest must return a conflict. Cache alone is not the source of truth.
7. **Safe handoff:** only registered adapter identifiers are accepted. Never accept a destination URL from user input. Validate scheme/host/port, resolve and block private/link-local addresses, defend against DNS rebinding, enforce egress policy and bounded timeouts, and verify payer responses.
8. **PHI minimization:** redact identifiers, diagnoses, item names, tokens and request bodies from logs by default. Use correlation IDs, not patient or claim details, for telemetry.
9. **Rule execution:** begin with a deterministic, declarative allow-listed rule DSL. Do not use `eval`, dynamic imports or arbitrary JavaScript. Add WASM only after dependency review, signed bundles, deterministic inputs, CPU/memory/wall-clock limits and adversarial tests are in place.
10. **Cryptography:** use audited platform crypto APIs and a managed/private signing key; never put private signing keys in source, browser bundles or ordinary environment examples. Include algorithm, key ID, canonicalization version and digest algorithm in the signed envelope.

## 3. Pipeline contract

Use an explicit ordered stage registry with versioned inputs and outputs:

1. Parse DTO and reject unknown fields.
2. Canonicalize data with a documented stable JSON canonicalization algorithm; normalize only fields whose domain semantics permit normalization.
3. Structural validation: tenant/resource ownership, required confirmed diagnosis and items, currency and amount bounds.
4. Semantic linkage: item-to-diagnosis linkage, coding-system version, billable/leaf-code checks where reference data supports them.
5. Clinical rules: only validated, versioned reference rules; surface uncertainty as a finding rather than inventing clinical facts.
6. Financial rules: configured tariff ceiling, duplicate service checks, frequency and bundle rules with provenance.
7. Coverage/temporal rules: coverage dates, prior-authorization flags and explicitly configured episode windows.
8. Optional risk scoring: advisory only until a representative, legally usable dataset, calibration, bias assessment, model versioning and human review process exist.
9. Aggregate deterministic findings and calculate a bounded, explainable score. A score never overrides a blocker.
10. Seal an immutable revision and audit the decision. Handoff is a separate authorized action.

Every finding should contain a stable rule ID, rule-set version, severity, machine-readable code, safe explanation, affected entity reference, evidence/provenance, and resolution state. Store the pipeline version and ordered stage results so runs can be reproduced.

## 4. Lifecycle and concurrency

- Define an explicit transition matrix for DRAFT, IN_REVIEW, VALIDATED, FLAGGED, READY, EXPORTED, SUBMITTED and VOID. Reject undocumented transitions.
- Use optimistic concurrency with a version/ETag on every mutation. Stale writes return a conflict and never silently overwrite.
- Use database transactions for session changes, audit append, revision creation and idempotency records.
- Treat submission as a durable state machine: PREPARED → IN_FLIGHT → ACKNOWLEDGED or RETRYABLE_FAILURE / TERMINAL_FAILURE. Persist the external reference and response digest.
- A timeout after sending is ambiguous. Reconcile using the same idempotency key or payer inquiry before attempting a new submission.

## 5. Data and database hardening checklist

Before any RAP migration is enabled:

- Confirm actual host table names, key types, membership model and reference-data schemas; do not copy illustrative foreign keys blindly.
- Set tenant context transaction-locally on every database transaction. Use a safe helper that handles missing/empty settings without casting errors.
- Enable and FORCE RLS on each tenant-scoped table; add both USING and WITH CHECK policies. Test as the actual API roles, not only as a database owner.
- Revoke broad table/function grants, secure SECURITY DEFINER functions with a fixed search_path, and grant only required RPC execution.
- Ensure child rows cannot claim a different tenant than their parent; enforce via constraints/triggers or tenant-safe RPCs, not duplicated columns alone.
- Make audit append-only for application roles, including protection against TRUNCATE and sequence misuse where applicable.
- Validate every constraint, FK, delete behavior, index and rollback against existing schema before applying.
- Use a tested UUIDv7 implementation if time-sortable identifiers are needed. Do not treat UUIDs as authorization secrets.
- Add indexes from measured query patterns; use trigram/full-text search with bounded result counts and statement timeouts.
- Avoid storing clinical/claim payloads in unencrypted object metadata. Apply encryption, least-privilege access, retention and deletion policies.

## 6. API and frontend safeguards

- Validate request DTOs at the boundary and cap body sizes, list lengths, pagination, export rows and search complexity.
- Rate-limit by verified tenant + actor + IP, with trusted-proxy configuration; do not trust arbitrary forwarded headers.
- Configure CORS from an explicit allow-list. Apply CSRF protection only to cookie-authenticated browser requests and ensure cookie names/options match the deployed HTTPS topology.
- Set security headers in a way compatible with the actual Vite/static-host deployment. Keep API security policy at the API boundary; do not assume frontend Helmet protects the backend.
- Use accessible, keyboard-operable diagnosis/item search, visible focus, reduced motion, loading/error/empty states and live announcements for findings.
- Autosave only drafts with debounce, conflict detection and explicit recovery. Never autosave across a sealed/validated boundary.
- Export preview and downloads must use server-generated artifacts, tenant checks, row caps, CSV formula-injection escaping and audit records. Require fresh MFA/step-up authorization for high-impact export and submission actions when supported by the host identity provider.

## 7. Operational and CI gates

Recommended incremental gates, enabled only when their scripts/configuration are present and verified:

- TypeScript, lint, unit tests, production build and migration/static checks.
- Unit and property tests for canonicalization, deterministic scoring, transition matrix, idempotency and signature verification.
- Tenant-isolation tests covering cross-tenant reads, inserts, updates, child-row spoofing and RPC execution.
- Audit-chain verifier and test fixtures for tampering, truncation and concurrent writes.
- SAST, dependency audit, secret scanning and an SBOM; pin third-party GitHub Actions to reviewed immutable SHAs before treating the pipeline as hardened.
- Integration tests for timeout/retry/replay and SSRF/private-address rejection using a controlled mock payer.
- Accessibility checks and browser happy-path tests.
- Load tests for representative session sizes; report measured p95/p99 rather than asserting unmeasured SLOs.
- Production deployment requires protected environment approval, rollback instructions, backup/restore evidence and an incident runbook.

Do not add unpinned `@master` security actions or a signing job that assumes a container image exists. Start with report-only security jobs, then make them blocking after false positives, permissions and artifact handling are tested.

## 8. Threat-to-test matrix

| Threat | Required test before release |
|---|---|
| Cross-tenant PHI access / IDOR | Attempt read/update/delete with another tenant's session and child IDs; expect deny with no data leakage |
| Privilege escalation | Tampered role/tenant claims and expired/revoked tokens; expect deny |
| SQL injection / search DoS | Fuzz search filters, enforce parameterization, page/timeout limits |
| Rule tampering | Alter bundle or version; signature/checksum mismatch must prevent loading |
| Diagnosis/content tampering | Modify any sealed field; verification must fail and original revision remain available |
| Replay / duplicate submission | Concurrent duplicate requests and same key with different body; one durable result or conflict |
| SSRF / DNS rebinding | Reject user URLs, private/link-local IPv4/IPv6, redirects to forbidden targets and rebinding |
| CSV injection | Values beginning with =, +, -, @, tab or carriage return are safely escaped |
| PHI leakage | Assert logs/traces/errors omit payload, diagnosis, token and patient identifiers |
| Audit tampering | Update/delete/truncate attempt denied; verifier detects modified or missing entries |
| Offline replay | Conflicting stale mutation does not overwrite server state or bypass lifecycle checks |

## 9. Delivery sequence

1. **Reconcile contracts:** continue inspecting host authorization, tenancy, reference data, audit, and persistence interfaces before connecting RAP to live host services.
2. **Deterministic domain core:** initial lifecycle matrix, findings schema, canonical JSON helper, risk indicator and pure unit tests are implemented in src/modules/rap/domain.ts.
3. **Allow-listed validation pipeline:** initial deterministic tenant-context, diagnosis, service, currency and amount rules are implemented in src/modules/rap/pipeline.ts. Cross-tenant mismatches fail closed before detail rules run.
4. **Persistence boundary:** tenant-scoped repository contracts, optimistic concurrency, append-only audit and isolated migration tests.
5. **Host integration:** permission catalogue, feature flag, host audit/notification interfaces and UI route gate.
6. **Expand validation stages:** semantic coding checks, approved clinical/financial/temporal reference data, rule provenance and bounded inputs.
7. **Signing and exports:** immutable revisions, signature verification CLI, safe formats and CSV injection defenses.
8. **Handoff:** mock adapter first, durable idempotency and reconciliation, then payer-specific adapters under explicit approval.
9. **Hardening:** tenant isolation, adversarial tests, accessibility, observability, backup/restore and load testing.
10. **Controlled launch:** keep disabled by default; enable only in an isolated test tenant after all release gates pass.

## 10. Explicit non-goals until separately approved

- Do not train or deploy an ML rejection model without representative authorized data and governance.
- Do not claim legal admissibility, HIPAA/GDPR/Act 843 compliance, SLSA Level 3, 99.95% availability, or stated latency targets without independent validation.
- Do not add Kafka, Redis, Vault, Keycloak, OPA, OpenSearch, MinIO, or Cloudflare solely to match a reference diagram. Introduce infrastructure only when deployment architecture, cost, operational ownership and recovery procedures are defined.
- Do not enable RAP in production, wire its migration into the default migration chain, submit to real payers, or modify the main branch as part of this blueprint.
