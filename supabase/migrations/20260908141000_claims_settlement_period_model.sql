-- Period-level claims settlement model.
-- CareFlow is NOT the source of detailed claims/payment transactions.
-- Detailed claim submissions and payment transactions remain in the external platform.
-- This table stores only the period summary entered from that external source and
-- the settlement figures confirmed by the external payment advice.
-- The payment advice itself is NOT stored in CareFlow.

CREATE TABLE public.claims_settlement_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
  insurance_company_id UUID NOT NULL REFERENCES public.insurance_companies(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_type TEXT NOT NULL DEFAULT 'month',

  -- External-platform figure entered for the reporting period.
  total_claims_submitted NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Effective rate captured with the period so historical calculations do not
  -- change when the configured rate is subsequently amended.
  withholding_tax_rate NUMERIC(7,4) NOT NULL DEFAULT 5.0000,

  -- System estimate while settlement is still outstanding.
  provisional_withholding_tax NUMERIC(14,2)
    GENERATED ALWAYS AS (
      round(total_claims_submitted * withholding_tax_rate / 100, 2)
    ) STORED,

  -- Confirmed only from the external payment advice.
  payment_received NUMERIC(14,2),
  rejection_amount NUMERIC(14,2),
  actual_withholding_tax NUMERIC(14,2),

  -- Lightweight reference to the external advice; no document/file is stored.
  payment_advice_reference TEXT,
  payment_advice_date DATE,

  settlement_status TEXT NOT NULL DEFAULT 'awaiting_payment',

  -- Difference between the system estimate and externally confirmed WHT.
  withholding_tax_variance NUMERIC(14,2)
    GENERATED ALWAYS AS (
      CASE
        WHEN actual_withholding_tax IS NULL THEN NULL
        ELSE round(actual_withholding_tax - provisional_withholding_tax, 2)
      END
    ) STORED,

  confirmed_by UUID REFERENCES auth.users(id),
  confirmed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT claims_settlement_period_dates_ck CHECK (period_end >= period_start),
  CONSTRAINT claims_settlement_period_type_ck CHECK (period_type IN ('month', 'quarter', 'custom')),
  CONSTRAINT claims_settlement_claim_total_ck CHECK (total_claims_submitted >= 0),
  CONSTRAINT claims_settlement_wht_rate_ck CHECK (withholding_tax_rate >= 0 AND withholding_tax_rate <= 100),
  CONSTRAINT claims_settlement_payment_ck CHECK (payment_received IS NULL OR payment_received >= 0),
  CONSTRAINT claims_settlement_rejection_ck CHECK (rejection_amount IS NULL OR rejection_amount >= 0),
  CONSTRAINT claims_settlement_actual_wht_ck CHECK (actual_withholding_tax IS NULL OR actual_withholding_tax >= 0),
  CONSTRAINT claims_settlement_status_ck CHECK (settlement_status IN ('awaiting_payment', 'payment_advice_received', 'reconciled')),
  CONSTRAINT claims_settlement_advice_fields_ck CHECK (
    settlement_status = 'awaiting_payment'
    OR (
      payment_received IS NOT NULL
      AND rejection_amount IS NOT NULL
      AND actual_withholding_tax IS NOT NULL
      AND NULLIF(btrim(payment_advice_reference), '') IS NOT NULL
    )
  ),
  CONSTRAINT claims_settlement_confirmation_ck CHECK (
    settlement_status <> 'reconciled'
    OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX claims_settlement_period_identity_idx
  ON public.claims_settlement_periods (facility_id, insurance_company_id, period_start, period_end);

CREATE INDEX claims_settlement_period_facility_idx
  ON public.claims_settlement_periods (facility_id, period_start DESC);

CREATE INDEX claims_settlement_period_insurer_idx
  ON public.claims_settlement_periods (facility_id, insurance_company_id, period_start DESC);

CREATE INDEX claims_settlement_status_idx
  ON public.claims_settlement_periods (facility_id, settlement_status, period_start DESC);

ALTER TABLE public.claims_settlement_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY claims_settlement_period_select ON public.claims_settlement_periods
  FOR SELECT TO authenticated
  USING (public.core_facility_access(facility_id));

CREATE POLICY claims_settlement_period_insert ON public.claims_settlement_periods
  FOR INSERT TO authenticated
  WITH CHECK (
    public.core_facility_access(facility_id)
    AND created_by = (select auth.uid())
    AND public.current_user_has_any_role(
      ARRAY['superuser','admin','claims_officer','data_entry_officer','accounts_officer']::public.app_role[]
    )
  );

CREATE POLICY claims_settlement_period_update ON public.claims_settlement_periods
  FOR UPDATE TO authenticated
  USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(
      ARRAY['superuser','admin','claims_officer','accounts_officer']::public.app_role[]
    )
  )
  WITH CHECK (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(
      ARRAY['superuser','admin','claims_officer','accounts_officer']::public.app_role[]
    )
  );

-- Settlement history should not be casually deleted because it feeds management reporting.
CREATE POLICY claims_settlement_period_delete ON public.claims_settlement_periods
  FOR DELETE TO authenticated
  USING (
    public.core_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

REVOKE ALL ON TABLE public.claims_settlement_periods FROM anon;

COMMENT ON TABLE public.claims_settlement_periods IS
  'Period-level settlement summary sourced from the external claims/payment platform. CareFlow stores figures and a payment-advice reference, not the payment advice document.';
COMMENT ON COLUMN public.claims_settlement_periods.total_claims_submitted IS
  'External-platform total for the reporting period; CareFlow does not mirror detailed claim transactions.';
COMMENT ON COLUMN public.claims_settlement_periods.provisional_withholding_tax IS
  'System estimate only; calculated from total claims submitted and the captured WHT rate and must not be presented as actual.';
COMMENT ON COLUMN public.claims_settlement_periods.actual_withholding_tax IS
  'Confirmed amount transcribed from the external payment advice.';
COMMENT ON COLUMN public.claims_settlement_periods.payment_advice_reference IS
  'Reference/identifier for the external payment advice. The document itself is not stored.';
