-- Inserts each payment and its matching ledger entry in one transaction.
-- SECURITY INVOKER deliberately preserves the caller's RLS permissions.
CREATE OR REPLACE FUNCTION public.import_payments_with_ledger(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_insurer_id uuid;
  v_facility_id uuid;
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'A non-empty array of payments is required.' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_insurer_id := NULLIF(v_row->>'insurance_company_id', '')::uuid;
    IF v_insurer_id IS NULL
      OR NULLIF(v_row->>'amount_paid', '') IS NULL
      OR NULLIF(v_row->>'payment_date', '') IS NULL
      OR NULLIF(v_row->>'claim_month', '') IS NULL
      OR NULLIF(v_row->>'claim_year', '') IS NULL THEN
      RAISE EXCEPTION 'Each payment requires insurer, amount, date, claim month and claim year.' USING ERRCODE = '22023';
    END IF;

    SELECT facility_id
      INTO v_facility_id
      FROM public.insurance_companies
      WHERE id = v_insurer_id;

    IF v_facility_id IS NULL THEN
      RAISE EXCEPTION 'The selected insurer is unavailable in the current facility.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.payments (
      insurance_company_id, amount_paid, payment_date, claim_month, claim_year,
      payment_method, reference_number, facility_id
    ) VALUES (
      v_insurer_id,
      (v_row->>'amount_paid')::numeric,
      (v_row->>'payment_date')::date,
      (v_row->>'claim_month')::integer,
      (v_row->>'claim_year')::integer,
      COALESCE(NULLIF(v_row->>'payment_method', ''), 'Bank Transfer'),
      NULLIF(v_row->>'reference_number', ''),
      v_facility_id
    );

    INSERT INTO public.ledger_entries (
      account_debit, account_credit, amount, reference, description,
      insurance_company_id, claim_month, claim_year, entry_type, entry_date
    ) VALUES (
      'Cash/Bank', 'Accounts Receivable', (v_row->>'amount_paid')::numeric,
      COALESCE(NULLIF(v_row->>'reference_number', ''), 'Payment N/A'),
      'Payment received', v_insurer_id, (v_row->>'claim_month')::integer,
      (v_row->>'claim_year')::integer, 'payment', (v_row->>'payment_date')::date
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.import_payments_with_ledger(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_payments_with_ledger(jsonb) TO authenticated;
