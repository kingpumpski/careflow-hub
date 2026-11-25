CREATE OR REPLACE FUNCTION public.is_member(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid) $$;
CREATE OR REPLACE FUNCTION public.can_write(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role IN ('superuser','admin','claims_officer','accounts_officer','data_entry_officer')) $$;
CREATE OR REPLACE FUNCTION public.is_admin(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role IN ('superuser','admin')) $$;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  RETURN NEW;
END;
$function$;

DO $$
DECLARE r record; t text;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' AND tablename IN
    ('claims','client_companies','diagnosis_codes','doctors','insurance_companies','ledger_entries','patients','payments','pre_authorizations','preauth_catalog_items','preauth_items','procedure_templates','procedures','withholding_tax','preauth_versions','preauth_email_log','audit_logs','system_settings','profiles','user_roles')
  LOOP EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename); END LOOP;
  DROP POLICY IF EXISTS "System insert notifications" ON public.notifications;

  FOREACH t IN ARRAY ARRAY['claims','client_companies','diagnosis_codes','doctors','insurance_companies','ledger_entries','patients','payments','pre_authorizations','preauth_catalog_items','preauth_items','procedure_templates','procedures','withholding_tax'] LOOP
    EXECUTE format('CREATE POLICY "Members read" ON public.%I FOR SELECT TO authenticated USING (public.is_member(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "Officers insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "Officers update" ON public.%I FOR UPDATE TO authenticated USING (public.can_write(auth.uid())) WITH CHECK (public.can_write(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "Admins delete" ON public.%I FOR DELETE TO authenticated USING (public.is_admin(auth.uid()))', t);
  END LOOP;
END $$;

CREATE POLICY "Members read versions" ON public.preauth_versions FOR SELECT TO authenticated USING (public.is_member(auth.uid()));
CREATE POLICY "Officers insert own versions" ON public.preauth_versions FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()) AND (edited_by IS NULL OR edited_by = auth.uid()));

CREATE POLICY "Members read email log" ON public.preauth_email_log FOR SELECT TO authenticated USING (public.is_member(auth.uid()));
CREATE POLICY "Officers log own emails" ON public.preauth_email_log FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()) AND (attempted_by IS NULL OR attempted_by = auth.uid()));

CREATE POLICY "Admins and auditors read audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'auditor'));

CREATE POLICY "Members read settings" ON public.system_settings FOR SELECT TO authenticated USING (public.is_member(auth.uid()));
CREATE POLICY "Admins manage settings" ON public.system_settings FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Own or admin read profiles" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "Own or admin update profiles" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Own or admin read roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Officers or self create notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR public.can_write(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete logos" ON storage.objects;
CREATE POLICY "Admins upload logos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'logos' AND public.is_admin(auth.uid()));
CREATE POLICY "Admins update logos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'logos' AND public.is_admin(auth.uid())) WITH CHECK (bucket_id = 'logos' AND public.is_admin(auth.uid()));
CREATE POLICY "Admins delete logos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'logos' AND public.is_admin(auth.uid()));