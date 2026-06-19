
ALTER TABLE public.insurance_companies
  ADD COLUMN IF NOT EXISTS additional_emails text[] DEFAULT '{}'::text[];

ALTER TABLE public.pre_authorizations
  ADD COLUMN IF NOT EXISTS accommodation_days integer,
  ADD COLUMN IF NOT EXISTS clinical_notes text,
  ADD COLUMN IF NOT EXISTS approval_notes text,
  ADD COLUMN IF NOT EXISTS custom_diagnoses text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS diagnosis_ids uuid[] DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS template_id uuid,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE INDEX IF NOT EXISTS idx_preauth_status ON public.pre_authorizations(status);
CREATE INDEX IF NOT EXISTS idx_preauth_insurer ON public.pre_authorizations(insurance_company_id);
