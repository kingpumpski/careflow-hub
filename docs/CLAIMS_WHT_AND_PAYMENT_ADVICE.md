# Claims WHT and payment-advice rules

## Two separate WHT values

CareFlow records two different figures for each claims period:

- **Provisional WHT** is an estimate calculated on the full gross claim amount submitted to the insurer. It is available before payment advice arrives and remains unchanged when a rejection is recorded.
- **Actual WHT** is transcribed from the insurer's payment advice after the insurer confirms the approved amount. The expected statutory calculation is based on approved gross claims (submitted less confirmed rejection), using the facility-approved rate captured for that period. The amount stated on the advice remains the recorded actual value; any difference from the estimate is shown as a variance for investigation.

No default statutory rate is assumed. A facility-approved rate must be explicitly entered for a new settlement period.

## Reconciliation basis

The insurer advice must be captured as separate values: **approved gross amount**, rejected amount, actual WHT, net cash received, advice reference/date, and actual receipt date. The approved gross amount is not interchangeable with net cash.

`submitted gross = approved gross + rejected amount + approval variance`

`approved gross = net cash received + actual WHT + approved-but-unpaid balance`

The approved gross amount is transcribed explicitly from the insurer's advice. It is not silently calculated as submitted less rejected, nor inferred from cash plus WHT. Both equations are reconciliation checks: any non-zero approval variance or approved-but-unpaid balance remains visible for investigation.

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

The reconciliation checks are:

`approval variance = submitted claims - approved claims - rejected claims`

`approved-but-unpaid balance = approved claims - actual WHT - net cash received`

The project should calculate both differences and show under/over-settlement or an unresolved variance. It should not silently force the figures to balance. The approved amount shown on the insurer advice must be captured as an explicit reported value; submitted less rejected is a comparison only, not a substitute for the approved figure. Actual WHT and net cash are also recorded independently from the advice.

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


## Cross-month claims-cycle matching (required algorithm)

The claims month is the ownership period for the submission. Advice and cash receipt dates are separate event dates and must never move or overwrite the original claims period.

- A September submission remains a September claims cycle even if advice is issued in October and cash is received in October or November.
- Each advice/remittance event is linked to its originating facility + insurer + claims period. Advice date and actual cash receipt date are recorded separately.
- Amounts on each remittance event are incremental, not cumulative. Multiple partial remittances are summed against the same claims cycle and retain their own references and dates.
- The calculation engine compares cumulative advice-approved gross with submitted less cumulative rejected amount. It separately compares approved gross with cumulative actual WHT plus net cash received.
- The engine reports approval variance and approved-but-unpaid balance independently. It must not force either value to zero.
- Receipt-month totals are also calculated from actual receipt dates so cash and WHT can be analysed in the month they were received/withheld, while the originating claims cycle remains intact.
- Duplicate advice references within a facility/insurer scope must be rejected or idempotently recognized; a retry must never count the same remittance twice.
- Provisional WHT remains calculated from the original full submitted amount and approved facility rate for the claims period. It remains visible for analysis after actual advice arrives. Actual WHT is accumulated only from advice/remittance records and is not replaced by the provisional estimate.

The existing frontend presentation is to remain unchanged during this algorithm improvement. The current screen fields and summary labels should continue to render as before; the reporting/query layer should supply corrected period aggregates and matching status. Any new event-level data capture must reuse the existing interaction where practical, and must not introduce a replacement claims-entry workflow.

**Release dependency:** the current period table has only one advice reference/date and one set of payment figures. A child remittance ledger and atomic database write path are required before this algorithm can be certified end-to-end. The pure domain calculation and tests are preparatory and do not by themselves enable multi-remittance persistence.


## Explicit approved amount and actual receipt date clarification

The approved gross amount stated by the insurer is a required, independent advice field. Do not calculate it as submitted minus rejected and present that result as the insurer's approved amount. Preserve submitted, approved, rejected, actual WHT and net cash as separate source figures. Calculate and display the approval variance and approved-but-unpaid balance without forcing either to zero.

Advice date and actual cash receipt date are distinct. A payment advice may be issued before the cash arrives, and a claims cycle may receive multiple partial remittances over multiple later months. Each incremental remittance must retain its own advice reference, advice date and receipt date. Receipt-month reporting must use the actual receipt date; claims-month reporting must continue to use the originating claims period.
