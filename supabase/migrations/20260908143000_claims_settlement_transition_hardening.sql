-- Harden the period-level settlement lifecycle at the database boundary.
-- CareFlow must not allow arbitrary status jumps or edits to an already reconciled period.

CREATE OR REPLACE FUNCTION public.enforce_claims_settlement_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.settlement_status = 'reconciled' THEN
    IF NEW.settlement_status <> OLD.settlement_status
       OR NEW.total_claims_submitted <> OLD.total_claims_submitted
       OR NEW.withholding_tax_rate <> OLD.withholding_tax_rate
       OR NEW.payment_received IS DISTINCT FROM OLD.payment_received
       OR NEW.rejection_amount IS DISTINCT FROM OLD.rejection_amount
       OR NEW.actual_withholding_tax IS DISTINCT FROM OLD.actual_withholding_tax
       OR NEW.payment_advice_reference IS DISTINCT FROM OLD.payment_advice_reference
       OR NEW.payment_advice_date IS DISTINCT FROM OLD.payment_advice_date
    THEN
      RAISE EXCEPTION 'Reconciled settlement periods are immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.settlement_status = 'awaiting_payment'
     AND NEW.settlement_status NOT IN ('awaiting_payment', 'payment_advice_received')
  THEN
    RAISE EXCEPTION 'Invalid settlement transition from awaiting_payment to %', NEW.settlement_status;
  END IF;

  IF OLD.settlement_status = 'payment_advice_received'
     AND NEW.settlement_status NOT IN ('payment_advice_received', 'reconciled')
  THEN
    RAISE EXCEPTION 'Invalid settlement transition from payment_advice_received to %', NEW.settlement_status;
  END IF;

  IF NEW.settlement_status = 'reconciled'
     AND (NEW.confirmed_by IS NULL OR NEW.confirmed_at IS NULL)
  THEN
    RAISE EXCEPTION 'Reconciliation requires confirmed_by and confirmed_at';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claims_settlement_transition
  ON public.claims_settlement_periods;

CREATE TRIGGER trg_claims_settlement_transition
BEFORE UPDATE ON public.claims_settlement_periods
FOR EACH ROW
EXECUTE FUNCTION public.enforce_claims_settlement_transition();

COMMENT ON FUNCTION public.enforce_claims_settlement_transition() IS
  'Prevents invalid claims-settlement lifecycle transitions and makes reconciled periods immutable.';
