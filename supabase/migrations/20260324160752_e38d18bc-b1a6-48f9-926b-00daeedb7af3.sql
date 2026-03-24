-- Create storage bucket for logos
INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true);

-- Storage policies for logos bucket
CREATE POLICY "Anyone can view logos" ON storage.objects FOR SELECT USING (bucket_id = 'logos');
CREATE POLICY "Authenticated users can upload logos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'logos');
CREATE POLICY "Authenticated users can update logos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'logos');
CREATE POLICY "Authenticated users can delete logos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'logos');

-- Create ledger_entries table for double-entry accounting
CREATE TABLE public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  account_debit text NOT NULL,
  account_credit text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  reference text,
  description text,
  insurance_company_id uuid REFERENCES insurance_companies(id),
  claim_month integer,
  claim_year integer,
  entry_type text NOT NULL DEFAULT 'claim_submission',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read ledger" ON public.ledger_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert ledger" ON public.ledger_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update ledger" ON public.ledger_entries FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete ledger" ON public.ledger_entries FOR DELETE TO authenticated USING (true);

-- Enable realtime on key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.claims;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.withholding_tax;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ledger_entries;