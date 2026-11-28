-- Contract tests for insurer-paid WHT certificate receipt accounting.
DO $test$
DECLARE
  v_rpc regprocedure := 'public.record_withholding_tax_receipt(uuid,text,date,date,numeric,text)'::regprocedure;
  v_definition TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'withholding_tax_receipts'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'WHT certificate receipts must exist with RLS enabled';
  END IF;

  IF has_table_privilege('authenticated', 'public.withholding_tax_receipts', 'INSERT')
     OR has_table_privilege('authenticated', 'public.withholding_tax_receipts', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.withholding_tax_receipts', 'DELETE') THEN
    RAISE EXCEPTION 'Authenticated clients must not write certificate rows directly';
  END IF;

  IF NOT has_function_privilege('authenticated', v_rpc, 'EXECUTE')
     OR has_function_privilege('anon', v_rpc, 'EXECUTE') THEN
    RAISE EXCEPTION 'Only authenticated clients may execute the certificate receipt RPC';
  END IF;

  SELECT pg_get_functiondef(v_rpc) INTO v_definition;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.withholding_tax_receipts'::regclass
       AND tgname = 'withholding_tax_receipts_immutable'
       AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.ledger_entries'::regclass
       AND tgname = 'certified_wht_ledger_immutable'
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'WHT certificate and related ledger entries must be immutable';
  END IF;

  IF position('Withholding Tax Receivable' IN v_definition) = 0
     OR position('Accounts Receivable' IN v_definition) = 0
     OR position('WHT Payable' IN v_definition) = 0
     OR position('WHT Expense' IN v_definition) = 0
     OR position('actual_withholding_tax' IN v_definition) = 0
     OR position('user_has_facility_access' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Certificate receipt RPC is missing the required tax-credit, provisional reversal, confirmed amount or facility-scope controls';
  END IF;
END;
$test$;
