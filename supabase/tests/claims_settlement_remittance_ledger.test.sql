-- Run with: supabase test db
-- Contract checks for append-only insurer advice/remittance persistence.
DO $test$
DECLARE
  v_rpc regprocedure :=
    'public.record_claims_settlement_remittance(uuid,text,date,date,numeric,numeric,numeric,numeric)'::regprocedure;
  v_rpc_definition text;
BEGIN
  IF to_regclass('public.claims_settlement_remittances') IS NULL THEN
    RAISE EXCEPTION 'Claims settlement remittance ledger is missing';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.claims_settlement_remittances'::regclass) THEN
    RAISE EXCEPTION 'RLS must be enabled on the remittance ledger';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.claims_settlement_remittances', 'SELECT')
     OR has_table_privilege('authenticated', 'public.claims_settlement_remittances', 'INSERT')
     OR has_table_privilege('authenticated', 'public.claims_settlement_remittances', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.claims_settlement_remittances', 'DELETE') THEN
    RAISE EXCEPTION 'Authenticated users must have read-only table access; writes use the atomic RPC';
  END IF;
  IF NOT has_function_privilege('authenticated', v_rpc, 'EXECUTE')
     OR has_function_privilege('anon', v_rpc, 'EXECUTE') THEN
    RAISE EXCEPTION 'Remittance RPC must be executable by authenticated users only';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.claims_settlement_remittances'::regclass
      AND tgname = 'claims_settlement_remittances_immutable'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Append-only remittance trigger is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'claims_settlement_remittances_reference_idx'
  ) THEN
    RAISE EXCEPTION 'Normalized advice-reference uniqueness index is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'claims_settlement_periods'
      AND column_name = 'approved_gross_amount'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'claims_settlement_periods'
      AND column_name = 'actual_receipt_date'
  ) THEN
    RAISE EXCEPTION 'Explicit approved gross and actual receipt date fields are missing';
  END IF;
  v_rpc_definition := pg_get_functiondef(v_rpc);
  IF position('FOR UPDATE' in v_rpc_definition) = 0
     OR position('user_has_facility_access' in v_rpc_definition) = 0
     OR position('claims.settlement.write' in v_rpc_definition) = 0
     OR position('lower(v_reference)' in v_rpc_definition) = 0
     OR position('approved_gross_amount = v_approved' in v_rpc_definition) = 0 THEN
    RAISE EXCEPTION 'Atomic remittance RPC is missing row locking, facility/permission scope, duplicate protection, or explicit approved amount aggregation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'claims_settlement_remittances'
      AND policyname = 'claims_settlement_remittances_read'
  ) THEN
    RAISE EXCEPTION 'Facility-scoped remittance read policy is missing';
  END IF;
END;
$test$;
