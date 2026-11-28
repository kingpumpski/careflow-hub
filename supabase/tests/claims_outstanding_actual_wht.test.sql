DO $test$
DECLARE
  v_definition TEXT;
BEGIN
  SELECT pg_get_viewdef('public.claims_outstanding_periods'::regclass, true)
    INTO v_definition;

  IF v_definition !~* 'GREATEST\(\s*COALESCE\(approved_gross_amount, submitted_amount - rejected_amount\)\s*-\s*paid_amount\s*-\s*actual_withholding_tax_amount'
     OR position('provisional_withholding_tax_amount' IN v_definition) = 0
     OR position('actual_withholding_tax_amount' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Claims outstanding view must display provisional WHT separately but calculate outstanding using confirmed actual WHT only';
  END IF;
END;
$test$;
