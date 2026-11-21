-- Keep the monthly claim's claim, provisional WHT and ledger records in one
-- database transaction. The public RPC is SECURITY INVOKER so each INSERT
-- remains subject to the existing table grants and RLS policies.
--
-- The internal helper exposes only the configured WHT rate to an authenticated
-- caller. It does not expose the system_settings table or accept a client rate.

CREATE OR REPLACE FUNCTION security_internal.configured_withholding_tax_rate()
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rate numeric;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to read the configured withholding-tax rate.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(NULLIF(BTRIM(s.value), '')::numeric, 5.00)
    INTO v_rate
    FROM public.system_settings AS s
   WHERE s.key = 'withholding_tax_rate';

  IF NOT FOUND THEN
    v_rate := 5.00;
  END IF;

  IF v_rate < 0 OR v_rate > 100 THEN
    RAISE EXCEPTION 'The configured withholding-tax rate must be between 0 and 100.'
      USING ERRCODE = '22023';
  END IF;

  RETURN v_rate;
END;
$$;

REVOKE ALL ON FUNCTION security_internal.configured_withholding_tax_rate() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION security_internal.configured_withholding_tax_rate() TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_monthly_claim_atomic(
  p_insurance_company_id uuid,
  p_claim_amount numeric,
  p_claim_month integer,
  p_claim_year integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_claim_id uuid;
  v_tax_rate numeric;
  v_tax_amount numeric;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to submit a monthly claim.'
      USING ERRCODE = '42501';
  END IF;

  IF p_insurance_company_id IS NULL THEN
    RAISE EXCEPTION 'An insurance company is required.'
      USING ERRCODE = '22023';
  END IF;

  IF p_claim_amount IS NULL
     OR p_claim_amount <= 0
     OR p_claim_amount <> ROUND(p_claim_amount, 2)
     OR p_claim_amount::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Claim amount must be positive and have no more than two decimal places.'
      USING ERRCODE = '22023';
  END IF;

  IF p_claim_month IS NULL OR p_claim_month < 1 OR p_claim_month > 12 THEN
    RAISE EXCEPTION 'Claim month must be between 1 and 12.'
      USING ERRCODE = '22023';
  END IF;

  IF p_claim_year IS NULL OR p_claim_year < 1 OR p_claim_year > 9999 THEN
    RAISE EXCEPTION 'Claim year must be between 1 and 9999.'
      USING ERRCODE = '22023';
  END IF;

  v_tax_rate := security_internal.configured_withholding_tax_rate();
  v_tax_amount := ROUND((p_claim_amount * v_tax_rate) / 100, 2);

  INSERT INTO public.claims (
    insurance_company_id,
    claim_amount,
    claim_month,
    claim_year,
    status
  ) VALUES (
    p_insurance_company_id,
    p_claim_amount,
    p_claim_month,
    p_claim_year,
    'submitted'
  )
  RETURNING id INTO v_claim_id;

  INSERT INTO public.withholding_tax (
    insurance_company_id,
    month,
    year,
    claim_total,
    tax_rate,
    tax_amount,
    is_actual
  ) VALUES (
    p_insurance_company_id,
    p_claim_month,
    p_claim_year,
    p_claim_amount,
    v_tax_rate,
    v_tax_amount,
    false
  );

  INSERT INTO public.ledger_entries (
    account_debit,
    account_credit,
    amount,
    reference,
    description,
    insurance_company_id,
    claim_month,
    claim_year,
    entry_type
  ) VALUES
    (
      'Accounts Receivable',
      'Claims Revenue',
      p_claim_amount,
      'Claim ' || p_claim_month::text || '/' || p_claim_year::text,
      'Monthly claim submission',
      p_insurance_company_id,
      p_claim_month,
      p_claim_year,
      'claim_submission'
    ),
    (
      'WHT Expense',
      'WHT Payable',
      v_tax_amount,
      'WHT ' || p_claim_month::text || '/' || p_claim_year::text,
      'Withholding tax on claim',
      p_insurance_company_id,
      p_claim_month,
      p_claim_year,
      'withholding_tax'
    );

  RETURN jsonb_build_object(
    'claim_id', v_claim_id,
    'tax_rate', v_tax_rate,
    'tax_amount', v_tax_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_monthly_claim_atomic(uuid, numeric, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_monthly_claim_atomic(uuid, numeric, integer, integer) TO authenticated;
