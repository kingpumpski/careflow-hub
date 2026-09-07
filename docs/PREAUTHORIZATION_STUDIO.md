# Pre-Authorization Studio

The Pre-Authorization Studio is the document-first workflow for reducing repetitive authorization preparation while keeping every request client-specific, unique and reviewable before the officer sends it to the insurer.

## Product boundary

This module is an **authorization-request preparation and issuance assistant**. Its responsibility ends when a complete, validated authorization request PDF and its corresponding insurer email have been generated and handed off to the officer's email client.

The module does **not** manage the insurer's response. Approval, decline, partial authorization, authorization numbers, validity periods, insurer follow-ups, delivery reconciliation and post-submission correspondence are outside this project's mandate.

## Workflow

1. Select the patient/client, insurance partner, doctor, procedure and procedure date.
2. Diagnosis and patient identifiers are pulled into the request.
3. Charges can be entered manually or loaded from the procedure/catalog.
4. An insurer-specific tariff override is applied when a matching effective tariff exists.
5. Every charge remains editable before the request is finalised.
6. The live preview mirrors the provider request layout; PDF output is A4.
7. Save the request as a draft to receive a unique `PA-YYYY-XXXXXXXX` request number.
8. A duplicate signature is retained using patient, membership number, insurer, procedure and procedure date so repeated requests can be detected.
9. The insurer email is generated from insurer and provider settings. Scheduled procedures use a pre-authorization request message; past procedure dates use a post-procedure documentation message.
10. Review the request, resolve blocking errors and explicitly confirm warnings.
11. Freeze the exact revision, generate the final PDF and prepare the corresponding email package.
12. Open the officer's email client with the recipient, subject and message populated. The officer remains responsible for reviewing and sending the email.

## Document formats

### Ghana facility format

The default format follows the supplied Mt. Carmel Hospital and Fertility Center template: provider header, request date, client/company, membership number, patient telephone, provider/doctor, procedure and procedure date, diagnosis, grouped service/charge rows and total.

### International request format

The international option keeps the same clinical and financial data but presents it as a neutral provider-generated request with a request number, issue date, patient/member information, requested procedure, diagnosis, itemised charges, currency and a coverage disclaimer. It is intentionally generic rather than pretending to be an insurer-specific statutory form.

## Tariff model

`preauth_insurer_tariffs` supports negotiated unit prices per insurer for either a procedure or a catalog item, with effective dates and an active flag. This prevents the global facility tariff from being silently treated as the insurer's tariff.

## Final review contract

Before a request is treated as ready for issuance, `src/modules/authorization/preauth-review.ts` validates the immutable business facts independently of the UI. Blocking errors cover missing patient, insurer, procedure/date, charge lines, non-positive totals, invalid quantities/prices, currency, and missing insurer submission email. Non-blocking warnings identify incomplete clinical or contact information.

The same module exposes `buildPreAuthDocumentPayload`, which creates a serialisable document snapshot without UI-only row identifiers. This is persisted as the canonical frozen revision snapshot.

## Finalisation and email handoff

The issuance boundary is:

**Save Draft → Review Request → Resolve Errors → Confirm Warnings → Freeze Revision → Generate Final PDF → Prepare Email → Open Email Client → Ready for Officer to Send**

`preauthorization_versions` is append-only and assigns an immutable revision number to each frozen snapshot. The email handoff record stores the exact revision, idempotency key, recipient manifest, attachment manifest and generated email content so the officer is not rebuilding the same request manually.

The browser must not claim that an external email was delivered. The system records that the package was prepared and hands control to the officer's email client.

The attachment manifest is revision-specific and currently records the final PDF artifact metadata. Supporting document storage can be added only if it directly improves authorization-request preparation; it is not an insurer-response workflow.

Recipient manifests normalise and de-duplicate insurer, additional and claims-CC addresses before the email is opened.

Duplicate detection is a conservative preparation guard. Matching active requests are surfaced before finalisation so the officer does not accidentally issue repetitive authorization requests. Explicit revision/resubmission behavior remains part of document issuance, not insurer response management.

## Audit boundary

`preauthorization_audit_events` may record document creation, revision finalisation and email handoff events for internal accountability. It does not represent insurer responses or delivery confirmation.

## Out of scope

The following are deliberately excluded from this module:

- insurer approval or decline tracking
- partial authorization tracking
- authorization-number capture
- authorization validity/expiry tracking
- insurer response reconciliation
- insurer follow-up correspondence
- delivery-status reconciliation
- response SLA management
- post-authorization claims processing

These concerns may belong to a separate future module, but they must not expand the mandate of the Pre-Authorization Studio.
