# ESLint warning baseline

The baseline records the existing ESLint warning signatures by repository-relative file, rule and message. CI fails when a signature count grows or a new signature appears. Existing warnings may be removed incrementally without requiring a one-time repository-wide cleanup.

- Baseline: 720 warnings, 0 errors.
- Captured from CareFlow Quality Gate run #991 at commit `e3c266eb07d7ef856fd9c59301a0834e7da959c3`.
- The only PR #48 source change not present on `main` is a new Settlement Exception Register component; its lint warnings were removed before baseline capture. The baseline therefore represents the unchanged main-branch warning set.
- Update the baseline only in a dedicated reviewed cleanup change, after confirming the warning count and reviewing the diff. Never update it merely to make a failing PR pass.

Run `npm run lint` locally or in CI. The checker uses ESLint's Node API and compares file/rule/message signatures, not just the total warning count.
