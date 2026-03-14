
CREATE TABLE IF NOT EXISTS public.diagnosis_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text NOT NULL,
  category text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.diagnosis_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read diagnosis_codes" ON public.diagnosis_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert diagnosis_codes" ON public.diagnosis_codes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update diagnosis_codes" ON public.diagnosis_codes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete diagnosis_codes" ON public.diagnosis_codes FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.procedure_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name text NOT NULL,
  procedure_id uuid REFERENCES public.procedures(id),
  diagnosis_code_id uuid REFERENCES public.diagnosis_codes(id),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.procedure_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read procedure_templates" ON public.procedure_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert procedure_templates" ON public.procedure_templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update procedure_templates" ON public.procedure_templates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete procedure_templates" ON public.procedure_templates FOR DELETE TO authenticated USING (true);
