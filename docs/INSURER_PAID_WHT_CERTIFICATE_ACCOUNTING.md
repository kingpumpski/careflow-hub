# Insurer-paid withholding-tax certificate accounting

## Business event

An insurance company withholds tax from a facility's approved claim settlement and pays that tax directly to the Ghana Revenue Authority on the facility's behalf. The insurer shares the tax certificate with the facility. This is not a cash receipt by the facility.

## Posting when the certificate is received

For a certificate-backed amount, CareFlow records:

| Account | Debit (GH¢) | Credit (GH¢) |
|---|---:|---:|
| Withholding Tax Receivable (tax-credit asset) | Certificate amount | — |
| Accounts Receivable — Insurance Company | — | Certificate amount |

This recognises the recoverable tax credit and reduces the insurer's outstanding receivable. It does not debit Bank/Cash and does not recognise a second expense.

The certificate record is linked to a monthly claims settlement period and stores the insurer, certificate reference, certificate date, date received, amount and notes. The server validates that the period has confirmed actual WHT and that the cumulative certificate amount does not exceed that confirmed amount. Multiple partial certificates are allowed; duplicate references are rejected.

## Correcting the provisional estimate

The earlier monthly claim submission routine records a provisional estimate as Dr WHT Expense / Cr WHT Payable. On the first certificate received for that claims period, the new atomic receipt RPC reverses the provisional estimate once:

| Account | Debit (GH¢) | Credit (GH¢) |
|---|---:|---:|
| WHT Payable | Provisional estimate | — |
| WHT Expense | — | Provisional estimate |

It then records the certificate-backed tax-credit posting above. The actual certificate amount, not the provisional estimate, becomes the recognised tax-credit asset.

The Income Statement treats the provisional estimate as memo information, not an expense. The Tax Liability report separately presents the WHT payable/reversal position and the certificate-backed WHT tax-credit receivable.

## Statement and claims schedule

- The company Statement of Account contains only the selected insurer's Accounts Receivable ledger transactions for the requested dates, including opening balance and every fetched transaction. It no longer contains the separate Claims & WHT Reconciliation panel.
- A certificate-backed WHT transaction appears as a distinct credit line in the insurer's statement and contributes to the closing and later brought-forward balance.
- The Claims Schedule shows Claims Period, Submitted, Rejected, Payments, confirmed Withholding Tax, Outstanding and Rejection Rate. Outstanding is Submitted (excluding rejected claims) less cash payments less confirmed actual WHT. Provisional estimates do not reduce outstanding.

## Release controls

The receipt table and RPC are additive migrations and are tested in the disposable PostgreSQL workflow. The UI uses the `VITE_CAREFLOW_WHT_CERTIFICATE_RECEIPTS_ENABLED` release switch. Keep it disabled until the migration-history reconciliation and production release gates are complete. Do not force-apply or mark old migrations applied to enable this feature.
