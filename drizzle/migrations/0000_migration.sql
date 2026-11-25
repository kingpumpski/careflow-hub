DROP POLICY IF EXISTS "Authenticated can insert preauth versions" ON public.preauth_versions;
CREATE POLICY "Staff can insert own preauth versions" ON public.preauth_versions
FOR INSERT TO authenticated
WITH CHECK (
  (edited_by IS NULL OR edited_by = auth.uid())
  AND (
    public.has_role(auth.uid(), 'superuser') OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'claims_officer') OR public.has_role(auth.uid(), 'data_entry_officer')
  )
);