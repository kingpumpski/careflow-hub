# CareFlow Hub — Release Readiness

## Release policy

`development` is the integration branch. `main` is the production branch. Production changes must pass the automated quality and security gates before merge.

## Application gates

- [ ] TypeScript check passes with no emit errors.
- [ ] ESLint passes without new blocking findings.
- [ ] Unit/regression tests pass.
- [ ] Production build completes successfully.
- [ ] Outstanding balances use the canonical formula:
  `max(0, submitted - rejected - payments - withholding_tax)`.
- [ ] Financial analytics use authoritative period data and distinguish actual vs provisional settlement.
- [ ] Provisional WHT estimates do not count as proof of actual WHT settlement.
- [ ] No client-side service-role or privileged Supabase credentials exist.
- [ ] Document intake requires human review before database commit.
- [ ] Offline operations remain available where supported and synchronize through the durable queue when connectivity returns.

## Database gates

- [ ] Schema changes are represented by versioned files under `supabase/migrations/`.
- [ ] RLS policies are enabled for application tables and reviewed for the affected role boundary.
- [ ] New privileged operations are protected by authenticated Edge Functions and explicit role checks.
- [ ] Calculated financial views remain `security_invoker` where appropriate.
- [ ] WHT rows distinguish calculated/provisional amounts from confirmed actual settlement (`is_actual`).
- [ ] Production data changes are performed through application workflows or controlled SQL/migration procedures, not ad-hoc client-side writes.
- [ ] A rollback/recovery approach is documented for destructive schema changes.

## Security gates

- [ ] Dependency audit passes.
- [ ] Edge Function authentication and origin controls pass.
- [ ] Sensitive secrets exist only in server-side configuration.
- [ ] Admin/self-role escalation protections are verified.
- [ ] Audit logging exists for privileged or financially material actions.
- [ ] Import/transcription inputs enforce size and type boundaries.

## Deployment gates

- [ ] GitHub Actions CI passes on `development`.
- [ ] Pull request to `main` passes the full quality/security checks.
- [ ] GitHub Pages build includes the SPA `404.html` fallback.
- [ ] Pages deployment completes successfully; a cancelled or superseded run is never treated as a release.
- [ ] Production URL is smoke-tested after deployment.
- [ ] Supabase production project is healthy and required migrations are applied.

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

## Release evidence

A release is considered production-ready only when the commit SHA, CI run, security audit, migration state, deployment result, and post-deployment smoke-test result can be identified and reviewed.
