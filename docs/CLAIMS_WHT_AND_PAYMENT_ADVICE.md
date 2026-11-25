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


## Remittance ledger implementation — 2026-11-23

The forward migration `20261123153000_add_claims_settlement_remittance_ledger.sql` adds an append-only advice/remittance child ledger linked to the original settlement period. It snapshots existing single-advice records for continuity, but deliberately leaves their approved-gross value NULL because the old schema never captured that independent insurer-stated figure. A historical value is not fabricated from submitted less rejected or from cash plus WHT.

New advice entries use the authenticated `record_claims_settlement_remittance` RPC. It locks the parent claims period, validates facility scope and settlement-write permission, rejects a duplicate normalized advice reference, appends one event, and refreshes the period's cumulative advice figures in the same transaction. Appending to a previously reconciled period moves it back to advice-received so the new remittance must be reviewed again. Direct authenticated table writes are revoked, and update/delete of remittance events are blocked.

The Claims Settlement screen now captures approved gross explicitly and records advice date separately from actual cash receipt date. It permits further advice against the same claims period and displays the remittance event history. The Outstanding Claims screen also has a separate receipt-month summary for net cash and actual WHT.

The forward reporting migration `20261123160000_match_aggregate_claims_periods_and_receipt_months.sql` makes the aggregate settlement register authoritative for submitted/rejected totals when a monthly period exists, retaining individual claim rows as fallback. It adds `claims_settlement_receipt_months` for actual cash/WHT grouped by receipt date. Claims ownership remains with the originating claims month.

**Limitations still requiring verification:** the append-only event table currently prevents destructive edits, but a controlled compensating-reversal/correction RPC is still required for erroneous entries. SQL contract tests have been added, but clean migration replay, transaction rollback, multi-role RLS tests and end-to-end cross-month behavior remain unverified until the disposable PostgreSQL environment starts and the historical pre-authorization migration chain is reconciled. No production migration or write has been performed.


## Controlled remittance corrections — 2026-11-23

The follow-on migration `20261123170000_add_claims_settlement_remittance_reversals.sql` adds a compensating reversal RPC. An authorized settlement writer selects the original remittance and supplies a correction reason. The RPC appends a reversal event referencing the original, recalculates the parent claims-period totals, and resets a previously reconciled period for review. The original event remains immutable. A remittance can be reversed only once.

Receipt-month reporting excludes reversed remittances while retaining both original and reversal entries in the audit history. A corrected payment is then entered as a new remittance with its own advice reference. Direct edits/deletes remain blocked.

This is now wired into the Claims Settlement screen. Database execution and rollback behavior are still awaiting a clean replay; the old pre-authorization migration mismatch prevents the disposable database from reaching these new migrations.


The aggregate monthly outstanding view now also uses the insurer-stated approved gross amount as the eligible amount once that value is known. It exposes approval variance and approved-unpaid balance separately. Where historical approved gross is unknown, the view does not invent it; the legacy submitted-minus-rejected basis remains the fallback until source evidence is captured.


Reconciliation confirmation is now blocked unless the period has an explicitly captured insurer-approved gross amount. This prevents a historical one-advice record with unknown approved gross from being marked reconciled using an inferred submitted-minus-rejected value. Such legacy periods remain flagged as unknown until their source advice can be verified; the new workflow does not fabricate a backfill.


## Implementation status — 2026-11-24

The source implementation now includes the previously identified remittance-ledger and correction requirements:

- Monthly aggregate submission is recorded once per facility + insurer + claims month/year in an immutable `monthly_claim_submissions` ledger. A stable idempotency key returns the original result after a retry; a different key cannot post the same monthly cycle again.
- The monthly submission RPC creates or links the matching `claims_settlement_periods` row atomically with the submitted claim, facility-approved provisional WHT record and ledger postings. Conflicting pre-existing period figures or advice are not silently overwritten.
- The provisional WHT rate is read from the selected facility's settings. It must be explicitly configured; no implicit 5% or other fallback is applied to a new settlement period. Facility Management already provides the rate-setting interaction.
- Provisional WHT remains based on the original submitted gross. The insurer-approved gross, rejected amount, actual WHT and net cash remain separate advice values. Actual receipt month remains distinct from originating claims month.
- The append-only remittance ledger and compensating-reversal workflow preserve the original advice events and exclude reversed events from receipt-month totals.

On main commit `d3d27d790273359a119f08777501c786e620f807`, the disposable PostgreSQL workflow completed the full source migration replay (with test-only temporary version normalization for the three documented legacy duplicate prefixes) and all 10 SQL contract files passed. The CareFlow Quality Gate, dependency audit, and GitHub Pages published-site smoke test also passed on that commit. A later documentation/UI-preservation commit is undergoing a fresh validation run.

The Claims Settlement WHT input retains its existing label and presentation; its value is supplied from the facility-approved setting rather than treated as an independently entered period rate. The calculation and persistence path, not the screen layout, is the intended change.

**Production boundary:** none of these migrations or Edge Function source changes have been deployed to the live Supabase project. No production database schema/data/ledger or Auth changes were made. The disposable replay does not resolve the authoritative production migration crosswalk or replace backup/restored-copy verification. Production rollout remains a separate approved operation.


## Settlement exception calculation correction — 2026-11-25

The settlement exception detector uses the insurer-stated approved gross amount as an independent source value. It evaluates two separate checks:

- **Approval/rejection variance** = submitted gross − insurer-reported approved gross − confirmed rejected gross. This is recorded as the existing `rejection_variance` exception type.
- **Approved-but-unpaid balance** = insurer-reported approved gross − actual WHT − net cash received. This is recorded as `payment_variance`.

The checks are not combined. A period with an approval variance and an unpaid approved balance can raise both exceptions. The detector does not infer approved gross from submitted less rejected, or from cash plus WHT. Legacy advice rows with no captured approved gross remain marked as incomplete and do not receive fabricated approval/payment variance calculations.

Online and offline exception detection now pass the same approved-gross input. The existing database exception type constraints already permit both exception types, so this correction does not require a schema migration. Regression tests cover separate variance detection and the legacy unknown-approved case.
