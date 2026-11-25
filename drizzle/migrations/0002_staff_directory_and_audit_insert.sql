CREATE OR REPLACE FUNCTION public.staff_directory() RETURNS TABLE(id uuid, full_name text, email text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, p.email FROM public.profiles p WHERE public.is_member(auth.uid())
$$;
REVOKE ALL ON FUNCTION public.staff_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_directory() TO authenticated;
CREATE POLICY "Officers insert own audit entries" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()) AND changed_by = auth.uid());