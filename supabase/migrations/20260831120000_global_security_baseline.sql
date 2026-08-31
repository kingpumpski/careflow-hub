-- CareFlow Hub global security baseline
-- This migration deliberately strengthens authorization without changing the
-- existing single-organization data model. Multi-tenant organization scoping
-- is a subsequent bounded migration and must not be retrofitted implicitly.

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.has_any_role(_roles public.app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = (SELECT auth.uid())
      AND role = ANY(_roles)
  );
$$;

REVOKE ALL ON FUNCTION private.has_any_role(public.app_role[]) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_any_role(public.app_role[]) TO authenticated;

-- Financial records: authenticated users may read, but writes are role-bound.
CREATE POLICY "Claims write roles only"
  ON public.claims AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));

CREATE POLICY "Claims update roles only"
  ON public.claims AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer']::public.app_role[])))
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer']::public.app_role[])));

CREATE POLICY "Claims are immutable by delete"
  ON public.claims AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (false);

CREATE POLICY "Payments write roles only"
  ON public.payments AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','accounts_officer']::public.app_role[])));

CREATE POLICY "Payments update roles only"
  ON public.payments AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin','accounts_officer']::public.app_role[])))
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','accounts_officer']::public.app_role[])));

CREATE POLICY "Payments are immutable by delete"
  ON public.payments AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (false);

CREATE POLICY "WHT write roles only"
  ON public.withholding_tax AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','accounts_officer','claims_officer']::public.app_role[])));

CREATE POLICY "WHT update roles only"
  ON public.withholding_tax AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin','accounts_officer','claims_officer']::public.app_role[])))
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','accounts_officer','claims_officer']::public.app_role[])));

CREATE POLICY "WHT is immutable by delete"
  ON public.withholding_tax AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (false);

CREATE POLICY "Ledger write roles only"
  ON public.ledger_entries AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','accounts_officer','claims_officer']::public.app_role[])));

CREATE POLICY "Ledger update roles only"
  ON public.ledger_entries AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin','accounts_officer']::public.app_role[])))
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','accounts_officer']::public.app_role[])));

CREATE POLICY "Ledger is immutable by delete"
  ON public.ledger_entries AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (false);

-- Claims/pre-authorization operational records.
CREATE POLICY "Preauth write roles only"
  ON public.pre_authorizations AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));

CREATE POLICY "Preauth update roles only"
  ON public.pre_authorizations AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])))
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));

CREATE POLICY "Preauth delete roles only"
  ON public.pre_authorizations AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin']::public.app_role[])));

CREATE POLICY "Preauth items write roles only"
  ON public.preauth_items AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));

CREATE POLICY "Preauth items update roles only"
  ON public.preauth_items AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])))
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));

CREATE POLICY "Preauth items delete roles only"
  ON public.preauth_items AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin']::public.app_role[])));

-- Master/catalog data.
CREATE POLICY "Insurance master write roles only"
  ON public.insurance_companies AS RESTRICTIVE
  FOR ALL TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])))
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));

CREATE POLICY "Client master write roles only"
  ON public.client_companies AS RESTRICTIVE
  FOR ALL TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])))
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));

CREATE POLICY "Doctor master write roles only"
  ON public.doctors AS RESTRICTIVE
  FOR ALL TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])))
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));

CREATE POLICY "Procedure master write roles only"
  ON public.procedures AS RESTRICTIVE
  FOR ALL TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])))
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));

CREATE POLICY "Patient master write roles only"
  ON public.patients AS RESTRICTIVE
  FOR ALL TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])))
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));

CREATE POLICY "Diagnosis master write roles only"
  ON public.diagnosis_codes AS RESTRICTIVE
  FOR ALL TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])))
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));

CREATE POLICY "Template master write roles only"
  ON public.procedure_templates AS RESTRICTIVE
  FOR ALL TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])))
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));

CREATE POLICY "Catalog master write roles only"
  ON public.preauth_catalog_items AS RESTRICTIVE
  FOR ALL TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])))
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));

CREATE POLICY "Settings write roles only"
  ON public.system_settings AS RESTRICTIVE
  FOR ALL TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin']::public.app_role[])))
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin']::public.app_role[])));

-- Roles are security metadata: only superusers may change them.
CREATE POLICY "Role mutations are superuser only"
  ON public.user_roles AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser']::public.app_role[])));

CREATE POLICY "Role updates are superuser only"
  ON public.user_roles AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser']::public.app_role[])))
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser']::public.app_role[])));

CREATE POLICY "Role deletes are superuser only"
  ON public.user_roles AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser']::public.app_role[])));

-- Audit logs are append-only and never client-writable.
CREATE POLICY "Audit logs are read by privileged roles"
  ON public.audit_logs AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin','auditor']::public.app_role[])));

CREATE POLICY "Audit logs reject client inserts"
  ON public.audit_logs AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "Audit logs reject client updates"
  ON public.audit_logs AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Audit logs reject client deletes"
  ON public.audit_logs AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (false);

-- Harden the existing trigger function. Trigger execution does not require
-- exposing EXECUTE privileges to API callers.
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'insert', to_jsonb(NEW), (SELECT auth.uid()));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'update', to_jsonb(OLD), to_jsonb(NEW), (SELECT auth.uid()));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id::text, 'delete', to_jsonb(OLD), (SELECT auth.uid()));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_trigger_fn() FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_claims_status_created_at ON public.claims(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claims_insurer_period ON public.claims(insurance_company_id, claim_year, claim_month);
CREATE INDEX IF NOT EXISTS idx_payments_insurer_date ON public.payments(insurance_company_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_insurer_date ON public.ledger_entries(insurance_company_id, entry_date DESC);
