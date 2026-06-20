
-- 1. diagnosis_codes
ALTER TABLE public.diagnosis_codes
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

-- 2. procedure_templates
ALTER TABLE public.procedure_templates
  ADD COLUMN IF NOT EXISTS diagnosis_code_ids UUID[] DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

-- 3. pre_authorizations
ALTER TABLE public.pre_authorizations
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS current_state TEXT NOT NULL DEFAULT 'Draft';

-- 4. preauth_versions
CREATE TABLE IF NOT EXISTS public.preauth_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preauth_id UUID NOT NULL REFERENCES public.pre_authorizations(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  state TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  change_note TEXT,
  edited_by UUID REFERENCES auth.users(id),
  edited_by_name TEXT,
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_preauth_versions_preauth ON public.preauth_versions(preauth_id, version_number DESC);

GRANT SELECT, INSERT ON public.preauth_versions TO authenticated;
GRANT ALL ON public.preauth_versions TO service_role;
ALTER TABLE public.preauth_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view preauth versions"
  ON public.preauth_versions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert preauth versions"
  ON public.preauth_versions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- 5. preauth_email_log
CREATE TABLE IF NOT EXISTS public.preauth_email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preauth_id UUID NOT NULL REFERENCES public.pre_authorizations(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  cc_emails TEXT[] DEFAULT '{}',
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|sent|failed
  provider_response TEXT,
  error_message TEXT,
  attempted_by UUID REFERENCES auth.users(id),
  attempted_by_name TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_preauth_email_log_preauth ON public.preauth_email_log(preauth_id, created_at DESC);

GRANT SELECT, INSERT ON public.preauth_email_log TO authenticated;
GRANT ALL ON public.preauth_email_log TO service_role;
ALTER TABLE public.preauth_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view email log"
  ON public.preauth_email_log FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service role manages email log"
  ON public.preauth_email_log FOR INSERT
  TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
