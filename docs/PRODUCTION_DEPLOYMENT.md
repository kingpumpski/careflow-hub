# CareFlow Hub production deployment

## Production architecture

- Frontend: Vite/React static application.
- Database/auth/realtime: Supabase project `claims tracker`.
- Protected server operations: Supabase Edge Functions.
- Offline operation: IndexedDB-backed local storage plus durable synchronization queue.
- Production static host target: GitHub Pages.

## GitHub Pages one-time prerequisite

The repository workflow can build and deploy the site, but the connected GitHub Actions token cannot enable GitHub Pages for a repository when the Pages site has never been created. The first activation must therefore be performed in the repository settings by a repository administrator.

1. Open **Settings → Pages** in the `kingpumpski/careflow-hub` repository.
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Save the setting.
4. Re-run the **Deploy CareFlow Hub to GitHub Pages** workflow, or push a new commit to `main`.
5. Verify the resulting deployment URL: `https://kingpumpski.github.io/careflow-hub/`.

The deployment workflow already performs typecheck, lint, unit tests, production build and SPA fallback generation before the Pages artifact is uploaded.

## Supabase production configuration

The browser may contain only the Supabase project URL and publishable/anon key. Never place a service-role key or other privileged secret in Vite environment variables.

Required server-side secret for document transcription:

- `LOVABLE_API_KEY` — configured in Supabase Edge Function secrets.

The production database schema is versioned under `supabase/migrations/`. Apply schema changes through migrations rather than ad-hoc production edits.

## First administrator bootstrap

Do not ship a hard-coded administrator account. Create the first legitimate Auth user through Supabase Auth, then assign the required administrative role using the controlled role-management workflow. The Users page intentionally cannot manufacture a privileged identity when no authenticated administrator exists.

## Release gate

A release is considered technically ready when:

- TypeScript passes.
- ESLint has zero errors.
- Unit tests pass.
- Production build passes.
- Dependency/security workflow passes.
- Supabase migrations are applied to the production project.
- Edge Functions are deployed with JWT verification enabled where required.
- Offline/online synchronization remains enabled.
- Calculated outstanding balances use the canonical formula:
  `submitted - rejected - payments - withholding tax`, floored at zero.
- A period is **actual** only when payment and withholding-tax reconciliation entries are both present; otherwise it is **provisional**.

## Database updates

For schema changes, create a new timestamped migration under `supabase/migrations/`, review it, apply it to the production Supabase project, and commit it to Git. For ordinary operational data entry, use the application workflows or Supabase Table Editor rather than changing schema files.
