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

## Core claims-to-payment reconciliation workflow

CareFlow is a period-level reconciliation register for information transcribed from the facility's approved claims system. It is not a replacement for that system and does not require staff to re-enter every individual claim.

For each insurer and claims month/year, staff record the aggregate submitted claims total from the approved system. The month and year identify the claims period, not necessarily the date on which the insurer later pays.

When the insurer sends payment advice or a remittance receipt, staff update that same insurer-period record with the figures stated on the advice:

- approved claim amount;
- rejected claim amount;
- actual withholding tax deducted;
- net cash remitted/received;
- advice or receipt reference and advice date.

The record must preserve the original submitted amount. It must not overwrite the submission total with the approved amount or net cash. These are separate stages and separate measures.

The reconciliation identity is:

`submitted claims = approved claims + rejected claims`

`approved claims = actual WHT + net cash received`

Therefore:

`submitted claims = rejected claims + actual WHT + net cash received`

The project should calculate the reconciliation difference and show under/over-settlement or an unresolved variance. It should not silently force the figures to balance. The approved amount shown on the insurer advice should be captured as an explicit reported value; the system may compare it with submitted less rejected and flag any difference rather than assuming the two are always identical.

Before advice arrives, provisional WHT is an estimate against the full submitted amount using the facility-approved rate. After advice arrives, actual WHT is the value transcribed from the insurer's advice and relates to the approved amount. Provisional WHT remains available as an estimate for comparison; it is never added to actual WHT.

Each insurer/month/year should have one identifiable submission period. If an insurer sends multiple remittances or supplementary advice for the same month, the workflow must support multiple advice/receipt entries or a controlled amendment history without overwriting the audit trail or double-counting receipts.

### Minimum management outputs

For each insurer and claims month/year, management should be able to see:

- total submitted claims;
- approved claims;
- rejected claims;
- provisional WHT;
- actual WHT;
- net cash received;
- total amount accounted for (rejected + actual WHT + net cash);
- outstanding/unexplained variance;
- advice received status, references and dates;
- days outstanding and payment delay.

The monthly and insurer-level summaries must be driven by this period-level register. Individual claim rows in CareFlow, if present for other workflows, must not be required to reconstruct the aggregate figures sourced from the approved claims system.
