-- Immutable compensating reversals for erroneous remittance entries.
-- A correction never edits or deletes the original advice event.

ALTER TABLE public.claims_settlement_remittances
  ADD COLUMN reversal_of_id UUID REFERENCES public.claims_settlement_remittances(id) ON DELETE RESTRICT,
  ADD COLUMN correction_reason TEXT;

ALTER TABLE public.claims_settlement_remittances
  DROP CONSTRAINT claims_settlement_remittance_source_ck,
  ADD CONSTRAINT claims_settlement_remittance_source_ck
    CHECK (
      (entry_source IN ('legacy_snapshot', 'remittance') AND reversal_of_id IS NULL AND correction_reason IS NULL)
      OR
      (entry_source = 'reversal' AND reversal_of_id IS NOT NULL AND NULLIF(btrim(correction_reason), '') IS NOT NULL)
    );

CREATE UNIQUE INDEX claims_settlement_remittance_reversal_once_idx
  ON public.claims_settlement_remittances (reversal_of_id)
  WHERE entry_source = 'reversal';

CREATE OR REPLACE FUNCTION public.refresh_claims_settlement_period_totals(p_settlement_period_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_approved NUMERIC(14,2);
  v_rejected NUMERIC(14,2);
  v_actual_wht NUMERIC(14,2);
  v_net_cash NUMERIC(14,2);
  v_latest_receipt DATE;
  v_latest_reference TEXT;
  v_latest_advice_date DATE;
  v_active_count INTEGER;
BEGIN
  SELECT
    CASE WHEN bool_or(r.approved_gross_amount IS NULL) THEN NULL
      ELSE sum(CASE WHEN r.entry_source = 'reversal' THEN -r.approved_gross_amount ELSE r.approved_gross_amount END) END,
    CASE WHEN bool_or(r.rejected_amount IS NULL) THEN NULL
      ELSE sum(CASE WHEN r.entry_source = 'reversal' THEN -r.rejected_amount ELSE r.rejected_amount END) END,
    CASE WHEN bool_or(r.actual_withholding_tax IS NULL) THEN NULL
      ELSE sum(CASE WHEN r.entry_source = 'reversal' THEN -r.actual_withholding_tax ELSE r.actual_withholding_tax END) END,
    CASE WHEN bool_or(r.net_cash_received IS NULL) THEN NULL
      ELSE sum(CASE WHEN r.entry_source = 'reversal' THEN -r.net_cash_received ELSE r.net_cash_received END) END,
    max(r.receipt_date) FILTER (
      WHERE r.entry_source IN ('legacy_snapshot', 'remittance')
        AND NOT EXISTS (
          SELECT 1 FROM public.claims_settlement_remittances x
          WHERE x.entry_source = 'reversal' AND x.reversal_of_id = r.id
        )
    )
  INTO v_approved, v_rejected, v_actual_wht, v_net_cash, v_latest_receipt
  FROM public.claims_settlement_remittances r
  WHERE r.settlement_period_id = p_settlement_period_id;

  SELECT count(*)::integer
  INTO v_active_count
  FROM public.claims_settlement_remittances r
  WHERE r.settlement_period_id = p_settlement_period_id
    AND r.entry_source IN ('legacy_snapshot', 'remittance')
    AND NOT EXISTS (
      SELECT 1 FROM public.claims_settlement_remittances x
      WHERE x.entry_source = 'reversal' AND x.reversal_of_id = r.id
    );

  SELECT r.advice_reference, r.advice_date
  INTO v_latest_reference, v_latest_advice_date
  FROM public.claims_settlement_remittances r
  WHERE r.settlement_period_id = p_settlement_period_id
    AND r.entry_source IN ('legacy_snapshot', 'remittance')
    AND NOT EXISTS (
      SELECT 1 FROM public.claims_settlement_remittances x
      WHERE x.entry_source = 'reversal' AND x.reversal_of_id = r.id
    )
  ORDER BY r.created_at DESC, r.id DESC
  LIMIT 1;

  UPDATE public.claims_settlement_periods
  SET approved_gross_amount = v_approved,
      rejection_amount = v_rejected,
      actual_withholding_tax = v_actual_wht,
      payment_received = v_net_cash,
      actual_receipt_date = v_latest_receipt,
      payment_advice_reference = v_latest_reference,
      payment_advice_date = v_latest_advice_date,
      settlement_status = CASE
        WHEN v_active_count > 0 AND v_approved IS NOT NULL AND v_rejected IS NOT NULL
          AND v_actual_wht IS NOT NULL AND v_net_cash IS NOT NULL
          THEN 'payment_advice_received'
        ELSE 'awaiting_payment'
      END,
      confirmed_by = NULL,
      confirmed_at = NULL,
      updated_at = now()
  WHERE id = p_settlement_period_id;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_claims_settlement_period_totals(UUID) FROM PUBLIC, anon, authenticated;

-- Replace the initial RPC so future entries use the same signed/active-event
-- aggregation after a previous remittance has been reversed.
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
SET search_path = ''
AS $$
DECLARE
  v_period public.claims_settlement_periods%ROWTYPE;
  v_entry_id UUID;
  v_reference TEXT := NULLIF(btrim(p_advice_reference), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication is required.'; END IF;
  IF v_reference IS NULL OR p_advice_date IS NULL
    OR p_approved_gross_amount IS NULL OR p_rejected_amount IS NULL
    OR p_actual_withholding_tax IS NULL OR p_net_cash_received IS NULL THEN
    RAISE EXCEPTION 'Advice reference, advice date and all four advice amounts are required.';
  END IF;
  IF p_approved_gross_amount < 0 OR p_rejected_amount < 0
    OR p_actual_withholding_tax < 0 OR p_net_cash_received < 0 THEN
    RAISE EXCEPTION 'Remittance amounts must be non-negative.';
  END IF;
  IF (p_net_cash_received > 0 OR p_actual_withholding_tax > 0) AND p_receipt_date IS NULL THEN
    RAISE EXCEPTION 'Actual receipt date is required when net cash was received.';
  END IF;

  SELECT * INTO v_period
  FROM public.claims_settlement_periods
  WHERE id = p_settlement_period_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement period was not found.'; END IF;
  IF NOT public.user_has_facility_access(v_period.facility_id)
    OR NOT (public.current_user_has_permission('payments.write')
      OR public.current_user_has_permission('claims.settlement.write')) THEN
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

  PERFORM public.refresh_claims_settlement_period_totals(p_settlement_period_id);
  RETURN v_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_claims_settlement_remittance(
  p_remittance_id UUID,
  p_correction_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_period public.claims_settlement_periods%ROWTYPE;
  v_original public.claims_settlement_remittances%ROWTYPE;
  v_reversal_id UUID;
  v_reason TEXT := NULLIF(btrim(p_correction_reason), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication is required.'; END IF;
  IF v_reason IS NULL OR length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'A correction reason of 1 to 1000 characters is required.';
  END IF;

  SELECT p.* INTO v_period
  FROM public.claims_settlement_periods p
  JOIN public.claims_settlement_remittances r ON r.settlement_period_id = p.id
  WHERE r.id = p_remittance_id
  FOR UPDATE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement period or remittance was not found.'; END IF;
  IF NOT public.user_has_facility_access(v_period.facility_id)
    OR NOT (public.current_user_has_permission('payments.write')
      OR public.current_user_has_permission('claims.settlement.write')) THEN
    RAISE EXCEPTION 'You do not have permission to correct advice for this facility.';
  END IF;

  SELECT * INTO v_original
  FROM public.claims_settlement_remittances
  WHERE id = p_remittance_id
  FOR UPDATE;
  IF v_original.entry_source <> 'remittance' THEN
    RAISE EXCEPTION 'Only newly recorded remittance events can be reversed.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.claims_settlement_remittances
    WHERE entry_source = 'reversal' AND reversal_of_id = p_remittance_id
  ) THEN
    RAISE EXCEPTION 'This remittance has already been reversed.';
  END IF;

  INSERT INTO public.claims_settlement_remittances (
    settlement_period_id, advice_reference, advice_date, receipt_date,
    approved_gross_amount, rejected_amount, actual_withholding_tax,
    net_cash_received, entry_source, reversal_of_id, correction_reason, created_by
  ) VALUES (
    v_original.settlement_period_id,
    'REVERSAL-' || v_original.id::text,
    v_original.advice_date,
    v_original.receipt_date,
    v_original.approved_gross_amount,
    v_original.rejected_amount,
    v_original.actual_withholding_tax,
    v_original.net_cash_received,
    'reversal',
    v_original.id,
    v_reason,
    auth.uid()
  )
  RETURNING id INTO v_reversal_id;

  PERFORM public.refresh_claims_settlement_period_totals(v_original.settlement_period_id);
  RETURN v_reversal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_claims_settlement_remittance(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_claims_settlement_remittance(UUID, TEXT) TO authenticated;

COMMENT ON COLUMN public.claims_settlement_remittances.reversal_of_id IS
  'For reversal entries, identifies the original immutable remittance event being compensated.';
COMMENT ON COLUMN public.claims_settlement_remittances.correction_reason IS
  'Required audit explanation for a compensating reversal; original advice entries are never edited or deleted.';
