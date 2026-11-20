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

## Protected Supabase production deployment

The database deployment workflow is manual-only. A normal push or merge to `main` must never trigger a production schema change automatically.

Before using **Actions → CareFlow Supabase Deploy → Run workflow**:

1. Configure a GitHub Environment named `production-database`.
2. Add required reviewers to that environment and enable deployment protection. Store `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID` and `SUPABASE_DB_PASSWORD` as environment secrets (not general repository secrets).
3. Verify a complete backup and a successful restore test for the same project.
4. Reconcile all local migration timestamps with `supabase_migrations.schema_migrations`, including the duplicate legacy prefixes recorded in [Migration version reconciliation](MIGRATION_RECONCILIATION.md).
5. Confirm that `SUPABASE_PROJECT_ID` matches the `project_id` in `supabase/config.toml`.
6. Dispatch the workflow and explicitly confirm all four release-gate inputs. The workflow prints the remote migration ledger and runs `supabase db push --dry-run` before applying migrations.

The workflow checks the explicit confirmations, environment secrets and project-ref match. GitHub Environment reviewer approval is a separate required control; do not remove it. The confirmations are an auditable operator attestation, not a substitute for backup evidence or restore testing.

## Full-system backup configuration

The Backup Center implementation and runbook are in [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md). Before calling backups operational:

1. Connect the Supabase account that owns project `jajfdgknctzqypdtvmxo`.
2. Enable Cloudflare R2 and create a private bucket dedicated to CareFlow backups.
3. Configure the `production-backup` GitHub Environment secrets listed in the runbook, including a Management API token with backup-download permission, the server-side Supabase key, the age public recipient and R2 credentials.
4. Configure the `backup-control` Edge Function secrets and deploy the function through the manually confirmed workflow.
5. Run a backup, verify the encrypted archive and restore it to a disposable replacement project before declaring disaster recovery ready.

The age private identity must remain offline and must not be stored in GitHub, Supabase or the application.

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


## GitHub Pages transport security

The post-deploy workflow tests the HTTPS site URL and all same-origin JavaScript/CSS assets. Main Pages deployment run 44727328070 confirmed that the live HTTP endpoint redirects to HTTPS and that the HTTPS app shell and assets are reachable.
