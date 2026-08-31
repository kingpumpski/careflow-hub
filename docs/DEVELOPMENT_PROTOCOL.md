# CareFlow Hub — Terminal-First Development Protocol

This repository is maintained without an autonomous coding agent. Every implementation phase therefore follows a repeatable terminal workflow.

## 1. Start from a clean checkpoint

```bash
git status --short
git branch --show-current
git log -1 --oneline
```

Never begin a phase with unexplained uncommitted changes.

## 2. Create a phase branch

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git checkout -b phase/<number>-<short-name>
```

## 3. Install deterministically

```bash
npm ci
```

Use the committed `package-lock.json`. Do not switch package managers during a phase.

## 4. Baseline validation

```bash
npm run lint
npm test -- --run
npm run build
```

If a baseline command fails, record the failure before changing application code.

## 5. Implement one bounded slice

Each slice should have:

- one domain objective;
- one database migration when schema changes are required;
- focused unit tests;
- focused UI/E2E coverage when the user journey changes;
- documentation updates;
- no unrelated refactors.

## 6. Validate after implementation

```bash
npm run lint
npm test -- --run
npm run build
```

For browser workflows:

```bash
npx playwright test
```

For Supabase schema work, also run the project's database tests/advisors in the target environment before release.

## 7. Commit convention

Use small, descriptive conventional commits:

- `feat:` product capability
- `fix:` defect correction
- `security:` security hardening
- `refactor:` structure-only change
- `test:` test coverage
- `docs:` documentation
- `chore:` maintenance

## 8. Recovery rule

If a terminal session is interrupted:

```bash
git status --short
git diff --stat
git diff --check
git log -5 --oneline
```

Recover from the last committed checkpoint rather than repeating unknown commands.

## 9. Release gate

A change is ready for merge only when the working tree is clean, the validation commands pass, the migration history is coherent, and the PR description states business impact, security impact, test evidence and rollback considerations.
