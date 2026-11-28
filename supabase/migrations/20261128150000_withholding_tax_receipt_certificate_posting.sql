-- Record insurer-paid withholding-tax certificates and the related tax-credit journal.
-- A tax certificate is evidence that the insurer paid the withheld amount to GRA
-- on the facility's behalf. It is not a cash receipt.

CREATE TABLE IF NOT EXISTS public.withholding_tax_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
  insurance_company_id UUID NOT NULL REFERENCES public.insurance_companies(id) ON DELETE RESTRICT,
  settlement_period_id UUID NOT NULL REFERENCES public.claims_settlement_periods(id) ON DELETE RESTRICT,
  certificate_reference TEXT NOT NULL CHECK (length(btrim(certificate_reference)) BETWEEN 1 AND 160),
  certificate_date DATE NOT NULL,
  received_date DATE NOT NULL,
  tax_amount NUMERIC(14,2) NOT NULL CHECK (tax_amount > 0 AND tax_amount = round(tax_amount, 2)),
  notes TEXT,
  journal_entry_id UUID NOT NULL REFERENCES public.ledger_entries(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS withholding_tax_receipts_certificate_once
  ON public.withholding_tax_receipts (
    facility_id, settlement_period_id, lower(btrim(certificate_reference))
  );

CREATE INDEX IF NOT EXISTS withholding_tax_receipts_facility_period_idx
  ON public.withholding_tax_receipts (facility_id, insurance_company_id, received_date DESC);

ALTER TABLE public.withholding_tax_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS withholding_tax_receipts_read ON public.withholding_tax_receipts;
CREATE POLICY withholding_tax_receipts_read
  ON public.withholding_tax_receipts
  FOR SELECT TO authenticated
  USING (
    security_internal.user_has_facility_access(facility_id)
    AND (
      security_internal.current_user_has_permission('payments.read')
      OR security_internal.current_user_has_permission('ledger.read')
    )
  );

REVOKE ALL ON TABLE public.withholding_tax_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.withholding_tax_receipts TO authenticated;

CREATE OR REPLACE FUNCTION public.record_withholding_tax_receipt(
  p_settlement_period_id UUID,
  p_certificate_reference TEXT,
  p_certificate_date DATE,
  p_received_date DATE,
  p_tax_amount NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_period public.claims_settlement_periods%ROWTYPE;
  v_recorded NUMERIC(14,2);
  v_provisional NUMERIC(14,2);
  v_journal_id UUID;
  v_receipt_id UUID;
  v_reversal_reference TEXT;
  v_reference TEXT := NULLIF(pg_catalog.btrim(p_certificate_reference), '');
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to record a withholding-tax certificate.'
      USING ERRCODE = '42501';
  END IF;
  IF NOT security_internal.current_user_has_permission('payments.write')
     AND NOT security_internal.current_user_has_permission('ledger.write') THEN
    RAISE EXCEPTION 'Payment write or ledger write permission is required.'
      USING ERRCODE = '42501';
  END IF;
  IF p_settlement_period_id IS NULL
     OR v_reference IS NULL
     OR length(v_reference) > 160
     OR p_certificate_date IS NULL
     OR p_received_date IS NULL
     OR p_tax_amount IS NULL
     OR p_tax_amount <= 0
     OR p_tax_amount <> round(p_tax_amount, 2)
     OR p_tax_amount::TEXT IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Enter a certificate reference, certificate date, receipt date and a positive tax amount to two decimal places.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_period
    FROM public.claims_settlement_periods
   WHERE id = p_settlement_period_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected claims settlement period does not exist.'
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT security_internal.user_has_facility_access(v_period.facility_id) THEN
    RAISE EXCEPTION 'Active membership in the settlement facility is required.'
      USING ERRCODE = '42501';
  END IF;
  IF v_period.period_type <> 'month'
     OR v_period.settlement_status NOT IN ('payment_advice_received', 'reconciled')
     OR v_period.actual_withholding_tax IS NULL THEN
    RAISE EXCEPTION 'A certificate can only be recorded against a monthly period with confirmed insurer payment advice and actual WHT.'
      USING ERRCODE = '55000';
  END IF;

  SELECT COALESCE(sum(tax_amount), 0)
    INTO v_recorded
    FROM public.withholding_tax_receipts
   WHERE settlement_period_id = v_period.id;
  IF v_recorded + p_tax_amount > v_period.actual_withholding_tax THEN
    RAISE EXCEPTION 'The certificate amount exceeds the unreceipted confirmed WHT for this claims period.'
      USING ERRCODE = '22023';
  END IF;

  -- The earlier monthly-claim workflow posted provisional WHT as
  -- Dr WHT Expense / Cr WHT Payable. On the first received certificate,
  -- reverse that estimate once; it is not a company tax expense.
  v_reversal_reference := 'WHT-PROVISIONAL-REVERSAL:' || v_period.id::TEXT;
  IF NOT EXISTS (
    SELECT 1 FROM public.ledger_entries
     WHERE reference = v_reversal_reference
       AND entry_type = 'withholding_tax_provisional_reversal'
  ) THEN
    SELECT COALESCE(sum(amount), 0)
      INTO v_provisional
      FROM public.ledger_entries
     WHERE facility_id = v_period.facility_id
       AND insurance_company_id = v_period.insurance_company_id
       AND claim_year = EXTRACT(YEAR FROM v_period.period_start)::INTEGER
       AND claim_month = EXTRACT(MONTH FROM v_period.period_start)::INTEGER
       AND account_debit = 'WHT Expense'
       AND account_credit = 'WHT Payable'
       AND entry_type = 'withholding_tax';

    IF v_provisional > 0 THEN
      INSERT INTO public.ledger_entries (
        facility_id, account_debit, account_credit, amount, reference,
        description, insurance_company_id, claim_month, claim_year, entry_type, entry_date
      ) VALUES (
        v_period.facility_id, 'WHT Payable', 'WHT Expense', v_provisional,
        v_reversal_reference,
        'Reverse provisional WHT estimate when insurer tax certificate is received',
        v_period.insurance_company_id,
        EXTRACT(MONTH FROM v_period.period_start)::INTEGER,
        EXTRACT(YEAR FROM v_period.period_start)::INTEGER,
        'withholding_tax_provisional_reversal',
        p_received_date
      );
    END IF;
  END IF;

  -- Insurer-paid WHT settles part of the insurer receivable and creates a
  -- recoverable tax-credit asset. No cash/bank account is affected.
  INSERT INTO public.ledger_entries (
    facility_id, account_debit, account_credit, amount, reference,
    description, insurance_company_id, claim_month, claim_year, entry_type, entry_date
  ) VALUES (
    v_period.facility_id, 'Withholding Tax Receivable', 'Accounts Receivable', p_tax_amount,
    'WHT-CERT:' || v_reference,
    'Insurer-paid withholding tax recognised from certificate ' || v_reference,
    v_period.insurance_company_id,
    EXTRACT(MONTH FROM v_period.period_start)::INTEGER,
    EXTRACT(YEAR FROM v_period.period_start)::INTEGER,
    'withholding_tax_receipt',
    p_received_date
  )
  RETURNING id INTO v_journal_id;

  INSERT INTO public.withholding_tax_receipts (
    facility_id, insurance_company_id, settlement_period_id,
    certificate_reference, certificate_date, received_date,
    tax_amount, notes, journal_entry_id, created_by
  ) VALUES (
    v_period.facility_id, v_period.insurance_company_id, v_period.id,
    v_reference, p_certificate_date, p_received_date,
    p_tax_amount, NULLIF(pg_catalog.btrim(p_notes), ''), v_journal_id, v_actor
  )
  RETURNING id INTO v_receipt_id;

  RETURN v_receipt_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_withholding_tax_receipt(UUID, TEXT, DATE, DATE, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_withholding_tax_receipt(UUID, TEXT, DATE, DATE, NUMERIC, TEXT) TO authenticated;

COMMENT ON TABLE public.withholding_tax_receipts IS
  'Append-only evidence of insurer-paid withholding-tax certificates; each receipt posts a tax-credit asset and Accounts Receivable credit, never cash.';
COMMENT ON FUNCTION public.record_withholding_tax_receipt(UUID, TEXT, DATE, DATE, NUMERIC, TEXT) IS
  'Records an insurer-paid WHT certificate, reverses the period provisional WHT expense/payable estimate once, and posts Dr Withholding Tax Receivable / Cr Accounts Receivable.';
