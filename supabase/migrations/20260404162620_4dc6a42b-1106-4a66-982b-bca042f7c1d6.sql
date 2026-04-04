
-- Create audit_logs table
CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name text NOT NULL,
  record_id text,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read audit_logs" ON public.audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "System insert audit_logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX idx_audit_logs_table ON public.audit_logs(table_name);
CREATE INDEX idx_audit_logs_changed_at ON public.audit_logs(changed_at DESC);
CREATE INDEX idx_audit_logs_record_id ON public.audit_logs(record_id);

-- Create audit trigger function
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'insert', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'update', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id::text, 'delete', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
END;
$$;

-- Attach to key tables
CREATE TRIGGER audit_claims AFTER INSERT OR UPDATE OR DELETE ON public.claims FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();
CREATE TRIGGER audit_payments AFTER INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();
CREATE TRIGGER audit_withholding_tax AFTER INSERT OR UPDATE OR DELETE ON public.withholding_tax FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();
CREATE TRIGGER audit_insurance_companies AFTER INSERT OR UPDATE OR DELETE ON public.insurance_companies FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();
CREATE TRIGGER audit_ledger_entries AFTER INSERT OR UPDATE OR DELETE ON public.ledger_entries FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();
CREATE TRIGGER audit_pre_authorizations AFTER INSERT OR UPDATE OR DELETE ON public.pre_authorizations FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();
