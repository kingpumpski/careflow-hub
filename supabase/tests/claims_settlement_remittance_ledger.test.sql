-- Run with: supabase test db
-- Contract checks for append-only insurer advice/remittance persistence.
DO $test$
DECLARE
  v_rpc regprocedure :=
    'public.record_claims_settlement_remittance(uuid,text,date,date,numeric,numeric,numeric,numeric)'::regprocedure;
  v_rpc_definition text;
  v_reverse regprocedure := 'public.reverse_claims_settlement_remittance(uuid,text)'::regprocedure;
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
  IF NOT (SELECT coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']::text[] FROM pg_proc p WHERE p.oid = v_rpc) THEN
    RAISE EXCEPTION 'Security-definer remittance RPC must pin an empty search_path';
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

  IF to_regclass('public.claims_settlement_receipt_months') IS NULL THEN
    RAISE EXCEPTION 'Receipt-month reporting view is missing';
  END IF;
  IF position('settlement_submission_periods' in pg_get_viewdef('public.claims_outstanding_periods'::regclass)) = 0 THEN
    RAISE EXCEPTION 'Aggregate claims-settlement periods must be the canonical monthly submission source';
  END IF;
  IF position('receipt_date' in pg_get_viewdef('public.claims_settlement_receipt_months'::regclass)) = 0 THEN
    RAISE EXCEPTION 'Cash/WHT receipt-month view must group by actual receipt date';
  END IF;
  IF position('reversal_of_id' in pg_get_viewdef('public.claims_settlement_receipt_months'::regclass)) = 0 THEN
    RAISE EXCEPTION 'Reversed remittance events must be excluded from receipt-month totals';
  END IF;

  IF NOT has_function_privilege('authenticated', v_reverse, 'EXECUTE')
     OR has_function_privilege('anon', v_reverse, 'EXECUTE') THEN
    RAISE EXCEPTION 'Compensating reversal RPC must be executable by authenticated users only';
  END IF;
  IF NOT (SELECT coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']::text[] FROM pg_proc p WHERE p.oid = v_reverse) THEN
    RAISE EXCEPTION 'Security-definer reversal RPC must pin an empty search_path';
  END IF;
  IF position('correction_reason' in pg_get_functiondef(v_reverse)) = 0
     OR position('reversal_of_id' in pg_get_functiondef(v_reverse)) = 0
     OR position('refresh_claims_settlement_period_totals' in pg_get_functiondef(v_reverse)) = 0 THEN
    RAISE EXCEPTION 'Reversal RPC must require an audit reason, reference the original event and refresh parent totals';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'claims_settlement_remittance_reversal_once_idx'
  ) THEN
    RAISE EXCEPTION 'A remittance must not be reversed more than once';
  END IF;
END;
$test$;
