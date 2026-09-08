# Offline Pre-Authorization Operations

## Purpose

CareFlow is operated internally against the offline bridge while the production Supabase connection is unavailable or being prepared.

The offline path is deliberately separate from the production database path:

`Pre-Authorization Studio → repository boundary → IndexedDB → Excel backup`

Excel is a portable backup/import format. It is not the live multi-user database.

## Data mode

Offline mode is now the default operational mode. No environment variable is required for the department to use the internal system.

Supabase is opt-in only:

```text
VITE_CAREFLOW_DATA_MODE=supabase
```

This prevents the department from silently switching to a remote database because a local environment variable was omitted.

## Internal workflow

1. Open **Pre-Authorization Studio**.
2. Confirm the page shows **OFFLINE MODE**.
3. Seed or import reference data (patients, insurers, doctors, procedures, diagnosis codes, catalogue items, tariffs and settings) using the Excel bridge.
4. Create and save a draft.
5. Continue editing the draft and use **Save draft** again; edits are persisted to IndexedDB and existing charge lines are replaced atomically.
6. Review blocking errors and warnings.
7. Resolve duplicate requests before freezing.
8. Freeze the request.
9. CareFlow creates one immutable local revision, a prepared email handoff and an audit event atomically.
10. The final PDF is generated from the frozen snapshot.
11. Open the mail client and send the prepared request manually.

CareFlow does not represent the request as insurer-received, approved or declined merely because the email client was opened.

## Excel backup discipline

- **Export backup** creates a workbook containing supported local entities.
- **Merge Excel** imports validated rows while retaining unrelated local records.
- **Replace from Excel** clears supported local entities and replaces them with the workbook contents. Use only when the workbook is known to be authoritative.
- Every imported row must have a unique `id` within its entity sheet.
- Import is transactional: validation or write failure does not intentionally leave a partially imported workbook.

Recommended internal practice: export a dated backup at the end of each working session and before any replace import.

## Production transition

Supabase remains the target production system. When production database access is available, it must be explicitly enabled and the production migration/runtime gates must be validated before treating Supabase as the authoritative environment.

Offline data should be treated as the department's operational source while offline mode is enabled, not as evidence that the production database has been synchronized.
