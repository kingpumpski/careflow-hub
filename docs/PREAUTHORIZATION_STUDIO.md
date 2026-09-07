# Pre-Authorization Studio

The Pre-Authorization Studio is the document-first workflow for reducing repetitive authorization preparation while keeping every request client-specific and reviewable before submission.

## Workflow

1. Select the patient/client, insurance partner, doctor, procedure and procedure date.
2. Diagnosis and patient identifiers are pulled into the request.
3. Charges can be entered manually or loaded from the procedure/catalog.
4. An insurer-specific tariff override is applied when a matching effective tariff exists.
5. Every charge remains editable before the request is saved or submitted.
6. The live preview mirrors the provider request layout; PDF output is A4.
7. Save the request as a draft to receive a unique `PA-YYYY-XXXXXXXX` request number.
8. A duplicate signature is retained using patient, membership number, insurer, procedure and procedure date so repeated requests can be detected.
9. The submission email is generated from the insurer and provider settings. Scheduled procedures use a pre-authorization request message; past procedure dates use a post-procedure documentation message.
10. Review the request, resolve blocking errors, explicitly confirm warnings, then freeze the exact revision before handoff.

## Document formats

### Ghana facility format

The default format follows the supplied Mt. Carmel Hospital and Fertility Center template: provider header, request date, client/company, membership number, patient telephone, provider/doctor, procedure and procedure date, diagnosis, grouped service/charge rows and total.

### International request format

The international option keeps the same clinical and financial data but presents it as a neutral provider-generated request with a request number, issue date, patient/member information, requested procedure, diagnosis, itemised charges, currency and a coverage disclaimer. It is intentionally generic rather than pretending to be an insurer-specific statutory form.

## Tariff model

`preauth_insurer_tariffs` supports negotiated unit prices per insurer for either a procedure or a catalog item, with effective dates and an active flag. This prevents the global facility tariff from being silently treated as the insurer's tariff.

## Final review contract

Before a request is treated as submission-ready, `src/modules/authorization/preauth-review.ts` validates the immutable business facts independently of the UI. Blocking errors cover missing patient, insurer, procedure/date, charge lines, non-positive totals, invalid quantities/prices, currency, and missing insurer submission email. Non-blocking warnings identify incomplete clinical or contact information.

The same module exposes `buildPreAuthDocumentPayload`, which creates a serialisable document snapshot without UI-only row identifiers. This is now persisted as the canonical revision snapshot.

## Submission lifecycle

The Studio now implements the first end-to-end lifecycle boundary:

**Save Draft → Review Request → Resolve Errors → Confirm Warnings → Freeze Revision → Generate Final PDF → Prepare Email → Record Submission**

`preauthorization_versions` is append-only and assigns an immutable revision number to each frozen snapshot. `preauthorization_submissions` records the exact revision, idempotency key, recipient manifest, attachment manifest, email content, submitting user and lifecycle timestamps. Email handoff is represented as `delivery_pending` because the browser cannot truthfully confirm that an external mail client actually sent the message.

The attachment manifest is revision-specific and currently records the final PDF artifact metadata. Supporting document storage can be added without changing the revision contract. The recipient manifest normalises and de-duplicates insurer, additional and claims-CC addresses.

Duplicate detection remains advisory at the preparation layer but is surfaced as a blocking UX guard at submission when matching active requests exist. The server remains the authoritative boundary for future uniqueness enforcement and idempotency.

## Response and audit foundation

`preauthorization_audit_events` records lifecycle events against the exact request, revision and submission. `preauthorization_responses` provides the persistence boundary for insurer responses, authorization numbers, approved amounts, validity dates and response notes.

The next lifecycle extensions are delivery-status reconciliation, explicit resubmission/version workflows, supporting attachment storage, and an insurer response/approval workspace. These should continue to reference the immutable revision rather than mutable draft fields.
