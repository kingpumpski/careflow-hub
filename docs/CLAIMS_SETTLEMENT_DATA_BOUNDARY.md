# Claims Settlement Data Boundary

## Purpose

CareFlow is an internal claims-operations system. It does not replace the external platform that stores detailed claims submissions and payment transactions.

## External source of truth

The external claims/payment platform remains authoritative for:

- detailed claims submitted
- detailed payment transactions
- the payment advice issued for a settlement period

CareFlow receives only the period-level figures needed for operations, reconciliation and management reporting.

## What CareFlow stores

For each settlement period, CareFlow stores:

- total claims submitted for the period
- withholding tax rate used for the provisional estimate
- provisional withholding tax calculated by CareFlow
- confirmed payment received
- confirmed rejection amount
- confirmed actual withholding tax
- payment advice reference/identifier
- payment advice date when available
- settlement lifecycle status
- confirmation metadata and audit timestamps

The payment advice itself is not uploaded, stored or archived by CareFlow.

## Provisional versus actual

Before payment advice is received:

`provisional_wht = total_claims_submitted × withholding_tax_rate / 100`

This is an estimate only.

After payment advice is received, the officer enters the exact settlement figures stated by the external advice. The confirmed actual WHT replaces the provisional value for reporting purposes, while the provisional value remains available so the system can measure the variance.

CareFlow must never infer actual WHT from payment received or rejection amount unless a separate, documented business rule explicitly authorizes that calculation.

## Settlement lifecycle

1. **Awaiting Payment** — period submitted figure captured; provisional calculations are available.
2. **Payment Advice Received** — payment, rejection and actual WHT are entered from the external advice and the advice reference is recorded.
3. **Reconciled** — an authorized officer confirms that the period has been reviewed and is ready for management reporting.

## Reporting principle

Management reports should distinguish clearly between:

- submitted/external figures
- system estimates
- externally confirmed settlement figures
- calculated variances

The reporting layer must not present provisional values as actual settlement outcomes.

## Deliberate non-goals

CareFlow will not become a duplicate claims-payment ledger by importing or manually reproducing every external transaction. Detailed transaction-level claims and payment records remain outside the CareFlow source of truth.
