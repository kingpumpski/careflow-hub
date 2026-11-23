-- Append-only advice/remittance ledger for aggregate insurer claims cycles.
-- Existing single-advice fields are preserved and snapshotted as legacy ledger entries.
-- New remittances are appended atomically; no production database is touched by this commit.

ALTER TABLE public.claims_settlement_periods
  ADD COLUMN IF NOT EXISTS approved_gross_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS actual_receipt_date DATE;

ALTER TABLE public.claims_settlement_periods
  ADD CONSTRAINT claims_settlement_approved_gross_ck
    CHECK (approved_gross_amount IS NULL OR approved_gross_amount >= 0);

CREATE TABLE public.claims_settlement_remittances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_period_id UUID NOT NULL REFERENCES public.claims_settlement_periods(id) ON DELETE RESTRICT,
  advice_reference TEXT NOT NULL,
  advice_date DATE NOT NULL,
  receipt_date DATE,
  approved_gross_amount NUMERIC(14,2),
  rejected_amount NUMERIC(14,2) NOT NULL,
  actual_withholding_tax NUMERIC(14,2) NOT NULL,
  net_cash_received NUMERIC(14,2) NOT NULL,
  entry_source TEXT NOT NULL DEFAULT 'remittance',
  created_by UUID REFERENCES auth.users(id) NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT claims_settlement_remittance_reference_ck
    CHECK (NULLIF(btrim(advice_reference), '') IS NOT NULL),
  CONSTRAINT claims_settlement_remittance_amounts_ck
    CHECK (
      (approved_gross_amount IS NULL OR approved_gross_amount >= 0)
      AND rejected_amount >= 0
      AND actual_withholding_tax >= 0
      AND net_cash_received >= 0
    ),
  CONSTRAINT claims_settlement_remittance_receipt_ck
    CHECK (net_cash_received = 0 OR receipt_date IS NOT NULL),
  CONSTRAINT claims_settlement_remittance_source_ck
    CHECK (entry_source IN ('legacy_snapshot', 'remittance'))
);

CREATE INDEX claims_settlement_remittances_period_idx
  ON public.claims_settlement_remittances (settlement_period_id, advice_date, created_at);
CREATE UNIQUE INDEX claims_settlement_remittances_reference_idx
  ON public.claims_settlement_remittances
    (settlement_period_id, lower(btrim(advice_reference)))
  WHERE entry_source = 'remittance';

ALTER TABLE public.claims_settlement_remittances ENABLE ROW LEVEL SECURITY;

CREATE POLICY claims_settlement_remittances_read
  ON public.claims_settlement_remittances
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.claims_settlement_periods p
      WHERE p.id = settlement_period_id
        AND public.user_has_facility_access(p.facility_id)
        AND (
          public.current_user_has_permission('payments.read')
          OR public.current_user_has_permission('claims.settlement.read')
        )
    )
  );

REVOKE ALL ON public.claims_settlement_remittances FROM anon, authenticated;
GRANT SELECT ON public.claims_settlement_remittances TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_claims_settlement_remittance_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Settlement remittance entries are append-only; record a controlled correction instead.';
END;
$$;

CREATE TRIGGER claims_settlement_remittances_immutable
  BEFORE UPDATE OR DELETE ON public.claims_settlement_remittances
  FOR EACH ROW EXECUTE FUNCTION public.prevent_claims_settlement_remittance_mutation();

-- Preserve the prior single-advice figures as one historical snapshot. Approved gross
-- remains NULL because the old schema did not capture the insurer-stated approved value.
INSERT INTO public.claims_settlement_remittances (
  settlement_period_id, advice_reference, advice_date, receipt_date,
  approved_gross_amount, rejected_amount, actual_withholding_tax,
  net_cash_received, entry_source, created_by, created_at
)
SELECT
  p.id,
  COALESCE(NULLIF(btrim(p.payment_advice_reference), ''), 'LEGACY-' || p.id::text),
  COALESCE(p.payment_advice_date, p.created_at::date),
  p.actual_receipt_date,
  NULL,
  COALESCE(p.rejection_amount, 0),
  COALESCE(p.actual_withholding_tax, 0),
  COALESCE(p.payment_received, 0),
  'legacy_snapshot',
  p.created_by,
  p.updated_at
FROM public.claims_settlement_periods p
WHERE p.payment_received IS NOT NULL
   OR p.rejection_amount IS NOT NULL
   OR p.actual_withholding_tax IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.record_claims_settlement_remittance(
  p_settlement_period_id UUID,
  p_advice_reference TEXT,
  p_advice_date DATE,
  p_receipt_date DATE,
  p_approved_gross_amount NUMERIC,
  p_rejected_amount NUMERIC,
  p_actual_withholding_tax NUMERIC,
  p_net_cash_received NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period public.claims_settlement_periods%ROWTYPE;
  v_entry_id UUID;
  v_reference TEXT := NULLIF(btrim(p_advice_reference), '');
  v_approved NUMERIC(14,2);
  v_rejected NUMERIC(14,2);
  v_actual_wht NUMERIC(14,2);
  v_net_cash NUMERIC(14,2);
  v_latest_receipt DATE;
  v_latest_reference TEXT;
  v_latest_advice_date DATE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;
  IF v_reference IS NULL OR p_advice_date IS NULL
    OR p_approved_gross_amount IS NULL OR p_rejected_amount IS NULL
    OR p_actual_withholding_tax IS NULL OR p_net_cash_received IS NULL THEN
    RAISE EXCEPTION 'Advice reference, advice date and all four advice amounts are required.';
  END IF;
  IF p_approved_gross_amount < 0 OR p_rejected_amount < 0
    OR p_actual_withholding_tax < 0 OR p_net_cash_received < 0 THEN
    RAISE EXCEPTION 'Remittance amounts must be non-negative.';
  END IF;
  IF p_net_cash_received > 0 AND p_receipt_date IS NULL THEN
    RAISE EXCEPTION 'Actual receipt date is required when net cash was received.';
  END IF;
  IF p_receipt_date IS NOT NULL AND p_receipt_date < p_advice_date THEN
    RAISE EXCEPTION 'Receipt date cannot be earlier than advice date.';
  END IF;

  SELECT * INTO v_period
  FROM public.claims_settlement_periods
  WHERE id = p_settlement_period_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement period was not found.'; END IF;
  IF NOT public.user_has_facility_access(v_period.facility_id)
    OR NOT (
      public.current_user_has_permission('payments.write')
      OR public.current_user_has_permission('claims.settlement.write')
    ) THEN
    RAISE EXCEPTION 'You do not have permission to record advice for this facility.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.claims_settlement_remittances r
    WHERE r.settlement_period_id = p_settlement_period_id
      AND lower(btrim(r.advice_reference)) = lower(v_reference)
  ) THEN
    RAISE EXCEPTION 'This advice reference has already been recorded for the claims period.';
  END IF;

  INSERT INTO public.claims_settlement_remittances (
    settlement_period_id, advice_reference, advice_date, receipt_date,
    approved_gross_amount, rejected_amount, actual_withholding_tax,
    net_cash_received, entry_source, created_by
  ) VALUES (
    p_settlement_period_id, v_reference, p_advice_date, p_receipt_date,
    p_approved_gross_amount, p_rejected_amount, p_actual_withholding_tax,
    p_net_cash_received, 'remittance', auth.uid()
  )
  RETURNING id INTO v_entry_id;

  SELECT
    CASE WHEN bool_or(approved_gross_amount IS NULL) THEN NULL ELSE sum(approved_gross_amount) END,
    COALESCE(sum(rejected_amount), 0),
    COALESCE(sum(actual_withholding_tax), 0),
    COALESCE(sum(net_cash_received), 0),
    max(receipt_date)
  INTO v_approved, v_rejected, v_actual_wht, v_net_cash, v_latest_receipt
  FROM public.claims_settlement_remittances
  WHERE settlement_period_id = p_settlement_period_id;

  SELECT advice_reference, advice_date
  INTO v_latest_reference, v_latest_advice_date
  FROM public.claims_settlement_remittances
  WHERE settlement_period_id = p_settlement_period_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  UPDATE public.claims_settlement_periods
  SET approved_gross_amount = v_approved,
      rejection_amount = v_rejected,
      actual_withholding_tax = v_actual_wht,
      payment_received = v_net_cash,
      actual_receipt_date = v_latest_receipt,
      payment_advice_reference = v_latest_reference,
      payment_advice_date = v_latest_advice_date,
      settlement_status = 'payment_advice_received',
      confirmed_by = NULL,
      confirmed_at = NULL,
      updated_at = now()
  WHERE id = p_settlement_period_id;

  RETURN v_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_claims_settlement_remittance(
  UUID, TEXT, DATE, DATE, NUMERIC, NUMERIC, NUMERIC, NUMERIC
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_claims_settlement_remittance(
  UUID, TEXT, DATE, DATE, NUMERIC, NUMERIC, NUMERIC, NUMERIC
) TO authenticated;

COMMENT ON TABLE public.claims_settlement_remittances IS
  'Append-only insurer advice/remittance events linked to their originating facility, insurer and claims period. Receipt-month cash is reported by receipt_date; claims ownership remains with the parent period.';
COMMENT ON COLUMN public.claims_settlement_periods.approved_gross_amount IS
  'Cumulative insurer-stated approved gross amount from advice events. Legacy snapshots remain NULL because the prior schema did not capture this figure independently.';
COMMENT ON COLUMN public.claims_settlement_periods.actual_receipt_date IS
  'Most recent actual cash receipt date; distinct from insurer advice date.';
