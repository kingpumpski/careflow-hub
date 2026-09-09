-- Close remaining RLS gaps on legacy/global master and reference data.
-- These tables do not currently carry facility_id, so authorization is
-- permission-scoped rather than facility-scoped.

DROP POLICY IF EXISTS "Authenticated read diagnosis_codes" ON public.diagnosis_codes;
DROP POLICY IF EXISTS "Authenticated insert diagnosis_codes" ON public.diagnosis_codes;
DROP POLICY IF EXISTS "Authenticated update diagnosis_codes" ON public.diagnosis_codes;
DROP POLICY IF EXISTS "Authenticated delete diagnosis_codes" ON public.diagnosis_codes;

CREATE POLICY diagnosis_codes_permission_select ON public.diagnosis_codes
  FOR SELECT TO authenticated USING (
    public.current_user_has_permission('masterdata.write')
    OR public.current_user_has_permission('preauth.read')
    OR public.current_user_has_permission('claims.read')
  );
CREATE POLICY diagnosis_codes_permission_insert ON public.diagnosis_codes
  FOR INSERT TO authenticated WITH CHECK (
    public.current_user_has_permission('masterdata.write')
  );
CREATE POLICY diagnosis_codes_permission_update ON public.diagnosis_codes
  FOR UPDATE TO authenticated
  USING (public.current_user_has_permission('masterdata.write'))
  WITH CHECK (public.current_user_has_permission('masterdata.write'));
CREATE POLICY diagnosis_codes_admin_delete ON public.diagnosis_codes
  FOR DELETE TO authenticated USING (
    public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

DROP POLICY IF EXISTS "Authenticated read procedure_templates" ON public.procedure_templates;
DROP POLICY IF EXISTS "Authenticated insert procedure_templates" ON public.procedure_templates;
DROP POLICY IF EXISTS "Authenticated update procedure_templates" ON public.procedure_templates;
DROP POLICY IF EXISTS "Authenticated delete procedure_templates" ON public.procedure_templates;

CREATE POLICY procedure_templates_permission_select ON public.procedure_templates
  FOR SELECT TO authenticated USING (
    public.current_user_has_permission('masterdata.write')
    OR public.current_user_has_permission('preauth.read')
    OR public.current_user_has_permission('claims.read')
  );
CREATE POLICY procedure_templates_permission_insert ON public.procedure_templates
  FOR INSERT TO authenticated WITH CHECK (
    public.current_user_has_permission('masterdata.write')
  );
CREATE POLICY procedure_templates_permission_update ON public.procedure_templates
  FOR UPDATE TO authenticated
  USING (public.current_user_has_permission('masterdata.write'))
  WITH CHECK (public.current_user_has_permission('masterdata.write'));
CREATE POLICY procedure_templates_admin_delete ON public.procedure_templates
  FOR DELETE TO authenticated USING (
    public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

DROP POLICY IF EXISTS insurance_companies_permission_select ON public.insurance_companies;
CREATE POLICY insurance_companies_permission_select ON public.insurance_companies
  FOR SELECT TO authenticated USING (
    public.current_user_has_permission('masterdata.write')
    OR public.current_user_has_permission('claims.read')
    OR public.current_user_has_permission('preauth.read')
  );
