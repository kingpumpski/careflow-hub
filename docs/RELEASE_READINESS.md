# CareFlow Hub — Release Readiness

## Release policy

`development` is the integration branch. `main` is the production branch. Production changes must pass the automated quality and security gates before merge.

## Application gates

- [x] TypeScript check passes.
- [x] ESLint passes.
- [x] Unit/regression tests pass.
- [x] Production build completes successfully.
- [x] Claims financial UI reads the authoritative `claims_outstanding_periods` view.
- [x] Outstanding balances use the canonical formula: `max(0, submitted - rejected - payments - withholding_tax)`.
- [x] Financial analytics use authoritative period data and distinguish actual vs provisional settlement.
- [x] Provisional WHT estimates do not count as proof of actual WHT settlement.
- [x] No client-side service-role or privileged Supabase credentials exist.
- [x] Document intake requires human review before database commit.
- [x] Offline operations remain available where supported and synchronize through the durable queue when connectivity returns.

## Database gates

- [x] Schema changes are represented by versioned files under `supabase/migrations/`.
- [x] RLS policies are enabled for application tables and reviewed for the affected role boundary.
- [x] New privileged operations are protected by authenticated Edge Functions and explicit role checks.
- [x] Calculated financial views remain `security_invoker` where appropriate.
- [x] WHT rows distinguish calculated/provisional amounts from confirmed actual settlement (`is_actual`).
- [x] WHT updates use the existing `payments.write` permission boundary.
- [x] Production data changes are performed through application workflows or controlled SQL/migration procedures.
- [ ] A rollback/recovery approach is documented for destructive schema changes.

## Security gates

- [x] Dependency audit passes.
- [x] Edge Function authentication and origin controls pass.
- [x] Sensitive secrets exist only in server-side configuration.
- [x] Admin/self-role escalation protections are verified.
- [x] Audit logging exists for privileged or financially material actions.
- [x] Import/transcription inputs enforce size and type boundaries.

## Deployment gates

- [x] GitHub Actions CI passes on `development`.
- [x] Pull request to `main` passes the current full quality/security checks.
- [x] GitHub Pages build includes the SPA `404.html` fallback.
- [x] Pages deployment workflow is configured with the required Pages permissions and artifact/deploy actions.
- [ ] Production URL has been independently browser-smoke-tested after the latest release candidate.
- [x] Supabase production project is healthy and required outstanding/WHT migrations are applied.

## Operational smoke test

After every production release:

1. Open the production application.
2. Sign in with a legitimate authorized account.
3. Confirm dashboard KPIs render.
4. Confirm online/offline status indicator behaves correctly.
5. Open Claims and verify claim/payment/WHT data.
6. Open Outstanding and confirm period status and calculated balances.
7. Open Advanced Analytics and verify filters update the visualizations.
8. Open Document Intake and verify review-before-commit behavior.
9. Verify an authorized admin can access user management.
10. Verify an unauthorized role cannot access privileged administration.

## Database update procedure

For schema changes, create a new timestamped migration in `supabase/migrations/`, test it against the intended Supabase environment, review RLS/index/function impact, then apply it through the controlled deployment process.

For normal records, use CareFlow's application workflows. Direct Table Editor changes should be limited to controlled administrative corrections and must preserve the same business rules used by the application.

## Current release gate

PR #21 (`release: consolidate enterprise claims hardening`) remains open until the production smoke test and first legitimate administrator bootstrap are completed. The latest development head is validated by CI, CareFlow Quality Gate, and Dependency Security Audit.
