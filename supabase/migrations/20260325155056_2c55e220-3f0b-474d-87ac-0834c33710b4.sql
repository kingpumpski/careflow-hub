-- Add is_active column to insurance_companies
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Create preauth catalog items table for searchable cost breakdown
CREATE TABLE IF NOT EXISTS public.preauth_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name text NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0,
  category text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.preauth_catalog_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read preauth_catalog_items" ON public.preauth_catalog_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert preauth_catalog_items" ON public.preauth_catalog_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update preauth_catalog_items" ON public.preauth_catalog_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete preauth_catalog_items" ON public.preauth_catalog_items FOR DELETE TO authenticated USING (true);

-- Add claim_month and claim_year to payments for proper period tracking
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS claim_month integer;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS claim_year integer;