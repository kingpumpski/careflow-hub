
-- Phase 1: extend claims with lifecycle timestamps + denial categorization fields
ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS expected_payment_date date,
  ADD COLUMN IF NOT EXISTS denial_category text,
  ADD COLUMN IF NOT EXISTS denial_reason text,
  ADD COLUMN IF NOT EXISTS root_cause text,
  ADD COLUMN IF NOT EXISTS denial_notes text,
  ADD COLUMN IF NOT EXISTS appeal_status text,
  ADD COLUMN IF NOT EXISTS appeal_outcome text,
  ADD COLUMN IF NOT EXISTS appeal_filed_at timestamptz;

-- Backfill submitted_at from created_at where missing for submitted/active claims
UPDATE public.claims
SET submitted_at = created_at
WHERE submitted_at IS NULL;

-- Helpful index for aging queries
CREATE INDEX IF NOT EXISTS idx_claims_submitted_at ON public.claims(submitted_at);
CREATE INDEX IF NOT EXISTS idx_claims_insurance_status ON public.claims(insurance_company_id, status);
