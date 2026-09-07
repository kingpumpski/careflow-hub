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

## Document formats

### Ghana facility format

The default format follows the supplied Mt. Carmel Hospital and Fertility Center template: provider header, request date, client/company, membership number, patient telephone, provider/doctor, procedure and procedure date, diagnosis, grouped service/charge rows and total.

### International request format

The international option keeps the same clinical and financial data but presents it as a neutral provider-generated request with a request number, issue date, patient/member information, requested procedure, diagnosis, itemised charges, currency and a coverage disclaimer. It is intentionally generic rather than pretending to be an insurer-specific statutory form.

## Tariff model

`preauth_insurer_tariffs` supports negotiated unit prices per insurer for either a procedure or a catalog item, with effective dates and an active flag. This prevents the global facility tariff from being silently treated as the insurer's tariff.

## Final review contract

Before a request is treated as submission-ready, `src/modules/authorization/preauth-review.ts` validates the immutable business facts independently of the UI. Blocking errors cover missing patient, insurer, procedure/date, charge lines, non-positive totals, invalid quantities/prices, currency, and missing insurer submission email. Non-blocking warnings identify incomplete clinical or contact information.

The same module exposes `buildPreAuthDocumentPayload`, which creates a serialisable document snapshot without UI-only row identifiers. This payload is intended to become the canonical revision snapshot for audit/history and later document-version persistence.

## Submission safety

The Studio separates preparation from submission. A draft can be previewed and modified without marking it completed. Existing lifecycle/version/audit functionality remains available in the Authorization Requests screen.

The next integration step is to place the review contract directly between draft editing and submission, then persist the approved snapshot/revision and recipient/attachment manifest before delivery. This keeps the generated document, email content and submitted request tied to the same revision.
