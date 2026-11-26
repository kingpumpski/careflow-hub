# ESLint warning baseline

The baseline records the existing ESLint warning signatures by repository-relative file, rule and message. CI fails when a signature count grows or a new signature appears. Existing warnings may be removed incrementally without requiring a one-time repository-wide cleanup.

- Reference baseline: **729 warning occurrences across 99 signatures**, as recorded in `scripts/eslint-warning-baseline.json`. The previous 720-warning figure in this document was stale and did not match the checked-in baseline file.
- Latest verified main result: **695 warnings, 0 errors**, from CareFlow Quality Gate run `45658899329` at commit `47a2457ce3f4c1dc31e0a50d281616b8d3df5ca6` (2026-11-25). This is 34 fewer warnings than the reference baseline, with no new warning signatures.
- The only PR #48 source change not present on `main` is a new Settlement Exception Register component; its lint warnings were removed before baseline capture. The baseline therefore represents the unchanged main-branch warning set.
- Update the baseline only in a dedicated reviewed cleanup change, after confirming the warning count and reviewing the diff. Never update it merely to make a failing PR pass.

Run `npm run lint` locally or in CI. The checker uses ESLint's Node API and compares file/rule/message signatures, not just the total warning count.
