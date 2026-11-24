-- Reversed remittance events remain in the audit ledger but must no longer
-- contribute to actual receipt-month cash or WHT reporting.
CREATE OR REPLACE VIEW public.claims_settlement_receipt_months
WITH (security_invoker = true)
AS
SELECT
  p.facility_id,
  p.insurance_company_id,
  date_trunc('month', r.receipt_date)::date AS receipt_month,
  EXTRACT(YEAR FROM r.receipt_date)::integer AS receipt_year,
  EXTRACT(MONTH FROM r.receipt_date)::integer AS receipt_month_number,
  sum(r.net_cash_received)::numeric AS net_cash_received,
  sum(r.actual_withholding_tax)::numeric AS actual_withholding_tax,
  count(*)::integer AS remittance_count
FROM public.claims_settlement_remittances r
JOIN public.claims_settlement_periods p
  ON p.id = r.settlement_period_id
WHERE r.receipt_date IS NOT NULL
  AND r.entry_source IN ('legacy_snapshot', 'remittance')
  AND NOT EXISTS (
    SELECT 1
    FROM public.claims_settlement_remittances reversal
    WHERE reversal.entry_source = 'reversal'
      AND reversal.reversal_of_id = r.id
  )
GROUP BY
  p.facility_id,
  p.insurance_company_id,
  date_trunc('month', r.receipt_date),
  EXTRACT(YEAR FROM r.receipt_date),
  EXTRACT(MONTH FROM r.receipt_date);

GRANT SELECT ON public.claims_settlement_receipt_months TO authenticated;
COMMENT ON VIEW public.claims_settlement_receipt_months IS
  'Actual cash and WHT grouped by receipt month. Reversed entries remain in the immutable audit ledger but are excluded from active financial totals.';
