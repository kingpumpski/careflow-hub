# Pre-Authorization Release Gate

CareFlow development is intentionally incremental. The Pre-Authorization Studio is the first operational priority because it directly addresses the department's urgent need to prepare authorization requests faster and more consistently.

## Operational scope

The module is complete only when an officer can reliably:

1. Select the patient/client, insurer, doctor and procedure.
2. Enter or edit request-specific information and charge lines.
3. Apply insurer-specific negotiated tariffs where configured.
4. Review the live A4 document.
5. Save a draft with a unique request number.
6. Detect possible duplicate requests before finalisation.
7. Resolve blocking review errors.
8. Explicitly confirm non-blocking warnings.
9. Freeze one canonical immutable revision.
10. Generate the final PDF from that frozen revision.
11. Prepare the corresponding insurer email from the same frozen revision.
12. Open the officer's email client for final human review and sending.

## Integrity boundary

The freeze operation is server-atomic. `finalize_preauthorization_handoff` creates the immutable revision and prepared email-handoff record in one transaction under the request's facility boundary. Repeated calls with the same idempotency key return the existing handoff instead of creating another revision.

Automatic legacy version-capture triggers are disabled for the document-first workflow. Saving or editing a draft must not silently create a final immutable issuance revision.

The final PDF/email package must be derived from the frozen snapshot, never from mutable form state after freeze.

## External email boundary

CareFlow prepares the email package only. It does not claim that the insurer received, opened, approved or declined the request. The officer remains responsible for reviewing and sending through the normal email client.

## Supporting document boundary

The final authorization PDF is generated locally in the browser. The attachment manifest identifies that generated PDF revision. CareFlow does not store payment-advice documents; payment advice belongs to the later claims-settlement domain as an external reference only.

## Release gates

Before the module is treated as operational:

- TypeScript must pass.
- ESLint must pass at the repository's configured threshold.
- Pre-authorization unit tests must pass.
- Production build must pass.
- Supabase migrations must apply cleanly in the target project.
- Facility isolation must be verified with at least two facility contexts.
- Draft creation must not create an immutable final revision.
- Freeze must create exactly one revision and one prepared handoff.
- Retrying the same freeze must be idempotent.
- The PDF must render from the frozen snapshot.
- The prepared email must use the same revision data.
- No workflow state may claim external insurer delivery.

## Incremental release strategy

Once these gates pass, the Pre-Authorization Studio can be released to the claims department while the remaining CareFlow modules continue to be audited and upgraded.

The next audit track after this gate is the rest of the repository: claims capture, payments/finance, master data, authentication/roles, Edge Functions, reporting, analytics, RLS, dependency/security posture, performance and test coverage.
