-- Pre-Authorization Studio: uniqueness, insurer tariffs, document metadata and safe auditability.
-- Additive migration; existing pre-authorization records are preserved.

ALTER TABLE public.pre_authorizations
  ADD COLUMN IF NOT EXISTS request_number text,
  ADD COLUMN IF NOT EXISTS document_revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS document_format text NOT NULL DEFAULT 'ghana',
  ADD COLUMN IF NOT EXISTS document_currency text NOT NULL DEFAULT 'GH¢',
  ADD COLUMN IF NOT EXISTS duplicate_signature text,
  ADD COLUMN IF NOT EXISTS document_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS document_finalized_at timestamptz;

UPDATE public.pre_authorizations
SET request_number = 'PA-' || EXTRACT(YEAR FROM COALESCE(created_at, now()))::text || '-' || UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 8))
WHERE request_number IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pre_authorizations_request_number
  ON public.pre_authorizations(request_number)
  WHERE request_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pre_authorizations_duplicate_signature
  ON public.pre_authorizations(duplicate_signature)
  WHERE duplicate_signature IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pre_authorizations_request_number
  ON public.pre_authorizations(request_number);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pre_authorizations_document_format_check') THEN
    ALTER TABLE public.pre_authorizations ADD CONSTRAINT pre_authorizations_document_format_check CHECK (document_format IN ('ghana', 'international'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.preauth_insurer_tariffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insurance_company_id uuid NOT NULL REFERENCES public.insurance_companies(id) ON DELETE CASCADE,
  procedure_id uuid REFERENCES public.procedures(id) ON DELETE CASCADE,
  catalog_item_id uuid REFERENCES public.preauth_catalog_items(id) ON DELETE CASCADE,
  negotiated_unit_price numeric(14,2) NOT NULL CHECK (negotiated_unit_price >= 0),
  currency_code text NOT NULL DEFAULT 'GHS',
  effective_from date,
  effective_to date,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT preauth_insurer_tariffs_one_target CHECK ((procedure_id IS NOT NULL AND catalog_item_id IS NULL) OR (procedure_id IS NULL AND catalog_item_id IS NOT NULL)),
  CONSTRAINT preauth_insurer_tariffs_dates_check CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_preauth_insurer_tariffs_procedure
  ON public.preauth_insurer_tariffs(insurance_company_id, procedure_id, COALESCE(effective_from, DATE '1900-01-01'))
  WHERE procedure_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_preauth_insurer_tariffs_catalog
  ON public.preauth_insurer_tariffs(insurance_company_id, catalog_item_id, COALESCE(effective_from, DATE '1900-01-01'))
  WHERE catalog_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_preauth_insurer_tariffs_lookup
  ON public.preauth_insurer_tariffs(insurance_company_id, is_active, effective_from, effective_to);

ALTER TABLE public.preauth_insurer_tariffs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.preauth_insurer_tariffs TO authenticated;
GRANT ALL ON public.preauth_insurer_tariffs TO service_role;
DROP POLICY IF EXISTS "Authenticated read preauth insurer tariffs" ON public.preauth_insurer_tariffs;
CREATE POLICY "Authenticated read preauth insurer tariffs" ON public.preauth_insurer_tariffs FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated manage preauth insurer tariffs" ON public.preauth_insurer_tariffs;
CREATE POLICY "Authenticated manage preauth insurer tariffs" ON public.preauth_insurer_tariffs FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.set_preauth_request_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.request_number IS NULL OR btrim(NEW.request_number) = '' THEN
    NEW.request_number := 'PA-' || EXTRACT(YEAR FROM COALESCE(NEW.created_at, now()))::text || '-' || UPPER(SUBSTRING(REPLACE(NEW.id::text, '-', '') FROM 1 FOR 8));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_preauth_request_number ON public.pre_authorizations;
CREATE TRIGGER trg_set_preauth_request_number BEFORE INSERT ON public.pre_authorizations FOR EACH ROW EXECUTE FUNCTION public.set_preauth_request_number();
