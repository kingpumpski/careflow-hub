-- Remove the legacy implicit 5% rate from period-level settlements.
-- New periods must receive the facility-approved rate explicitly from the UI/API.
-- This migration changes schema defaults only; it does not rewrite existing rates or data.

ALTER TABLE public.claims_settlement_periods
  ALTER COLUMN withholding_tax_rate DROP DEFAULT;

COMMENT ON COLUMN public.claims_settlement_periods.withholding_tax_rate IS
  'Facility-approved statutory WHT rate, explicitly captured for this settlement period. No assumed default rate is permitted.';
