-- Correct the baseline's master-data/settings policies so read access remains
-- available to authenticated operational/audit roles while mutations stay role-bound.

DO $$
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'insurance_companies', 'client_companies', 'doctors', 'procedures',
    'patients', 'diagnosis_codes', 'procedure_templates', 'preauth_catalog_items'
  ] LOOP
    policy_name := CASE table_name
      WHEN 'insurance_companies' THEN 'Insurance master write roles only'
      WHEN 'client_companies' THEN 'Client master write roles only'
      WHEN 'doctors' THEN 'Doctor master write roles only'
      WHEN 'procedures' THEN 'Procedure master write roles only'
      WHEN 'patients' THEN 'Patient master write roles only'
      WHEN 'diagnosis_codes' THEN 'Diagnosis master write roles only'
      WHEN 'procedure_templates' THEN 'Template master write roles only'
      ELSE 'Catalog master write roles only'
    END;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, table_name);
  END LOOP;
END $$;

CREATE POLICY "Insurance master insert roles only" ON public.insurance_companies AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));
CREATE POLICY "Insurance master update roles only" ON public.insurance_companies AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])))
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));
CREATE POLICY "Insurance master delete roles only" ON public.insurance_companies AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin']::public.app_role[])));

CREATE POLICY "Client master insert roles only" ON public.client_companies AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));
CREATE POLICY "Client master update roles only" ON public.client_companies AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])))
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));
CREATE POLICY "Client master delete roles only" ON public.client_companies AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin']::public.app_role[])));

CREATE POLICY "Doctor master insert roles only" ON public.doctors AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));
CREATE POLICY "Doctor master update roles only" ON public.doctors AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])))
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));
CREATE POLICY "Doctor master delete roles only" ON public.doctors AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin']::public.app_role[])));

CREATE POLICY "Procedure master insert roles only" ON public.procedures AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));
CREATE POLICY "Procedure master update roles only" ON public.procedures AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])))
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));
CREATE POLICY "Procedure master delete roles only" ON public.procedures AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin']::public.app_role[])));

CREATE POLICY "Patient master insert roles only" ON public.patients AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));
CREATE POLICY "Patient master update roles only" ON public.patients AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])))
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));
CREATE POLICY "Patient master delete roles only" ON public.patients AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin']::public.app_role[])));

CREATE POLICY "Diagnosis master insert roles only" ON public.diagnosis_codes AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));
CREATE POLICY "Diagnosis master update roles only" ON public.diagnosis_codes AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])))
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));
CREATE POLICY "Diagnosis master delete roles only" ON public.diagnosis_codes AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin']::public.app_role[])));

CREATE POLICY "Template master insert roles only" ON public.procedure_templates AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));
CREATE POLICY "Template master update roles only" ON public.procedure_templates AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])))
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));
CREATE POLICY "Template master delete roles only" ON public.procedure_templates AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin']::public.app_role[])));

CREATE POLICY "Catalog master insert roles only" ON public.preauth_catalog_items AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));
CREATE POLICY "Catalog master update roles only" ON public.preauth_catalog_items AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])))
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin','claims_officer','data_entry_officer']::public.app_role[])));
CREATE POLICY "Catalog master delete roles only" ON public.preauth_catalog_items AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin']::public.app_role[])));

DROP POLICY IF EXISTS "Settings write roles only" ON public.system_settings;
CREATE POLICY "Settings insert roles only" ON public.system_settings AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin']::public.app_role[])));
CREATE POLICY "Settings update roles only" ON public.system_settings AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin']::public.app_role[])))
  WITH CHECK ((SELECT private.has_any_role(ARRAY['superuser','admin']::public.app_role[])));
CREATE POLICY "Settings delete roles only" ON public.system_settings AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING ((SELECT private.has_any_role(ARRAY['superuser','admin']::public.app_role[])));
