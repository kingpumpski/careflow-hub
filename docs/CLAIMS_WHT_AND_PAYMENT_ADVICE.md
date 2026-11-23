# Claims WHT and payment-advice rules

## Two separate WHT values

CareFlow records two different figures for each claims period:

- **Provisional WHT** is an estimate calculated on the full gross claim amount submitted to the insurer. It is available before payment advice arrives and remains unchanged when a rejection is recorded.
- **Actual WHT** is transcribed from the insurer's payment advice after the insurer confirms the approved amount. The expected statutory calculation is based on approved gross claims (submitted less confirmed rejection), using the facility-approved rate captured for that period. The amount stated on the advice remains the recorded actual value; any difference from the estimate is shown as a variance for investigation.

No default statutory rate is assumed. A facility-approved rate must be explicitly entered for a new settlement period.

## Reconciliation basis

The payment-advice field is **net cash received after WHT**, not the approved gross amount.

`approved gross = submitted gross - rejected amount`

`approved gross = net cash received + actual WHT`

For example, with a test-only rate R:

| Item | Amount |
|---|---:|
| Submitted gross | GHC 1,000 |
| Rejected | GHC 100 |
| Approved gross | GHC 900 |
| Provisional WHT | GHC 1,000 × R% |
| Actual WHT | GHC 900 × R% |
| Net cash received | GHC 900 − actual WHT |

The rate R is deliberately symbolic here; the facility must supply its approved statutory rate.

## Reporting

- Before payment advice is recorded, monthly outstanding reporting uses provisional WHT and any payment transactions already recorded.
- After confirmed payment advice is recorded, monthly reporting uses the advice's net cash and actual WHT. It does not add provisional and actual WHT together or double-count cash transactions for the same monthly period.
- The original provisional estimate remains available for comparison and variance reporting.
- Monthly settlement periods must cover a complete calendar month to feed monthly claims and payment summaries. Quarterly/custom periods remain in the settlement management report and are not allocated across monthly claims periods.

## Permissions

Claims officers receive scoped `claims.settlement.read` and `claims.settlement.write` permissions to manage insurer payment advice without receiving general `payments.write` or `ledger.write` permissions. Accounts staff continue to use their existing payment permissions. Data-entry roles do not receive settlement-write access.

## Release note

These rules describe the code and forward migrations proposed in the claims settlement work. They do not authorize applying migrations to production. SQL replay, RLS tests, transaction tests, and production migration-ledger reconciliation are required before release.
