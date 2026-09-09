DROP POLICY IF EXISTS preauth_handoff_log_insert_permission ON public.preauth_handoff_log;
CREATE POLICY preauth_handoff_log_insert_permission ON public.preauth_handoff_log
FOR INSERT TO authenticated
WITH CHECK (
  security_internal.current_user_has_permission('preauth.read')
  AND prepared_by = (SELECT auth.uid())
  AND security_internal.user_has_facility_access(facility_id)
);

DROP POLICY IF EXISTS preauth_email_log_insert_permission ON public.preauth_email_log;
CREATE POLICY preauth_email_log_insert_permission ON public.preauth_email_log
FOR INSERT TO authenticated
WITH CHECK (
  security_internal.current_user_has_permission('preauth.read')
  AND attempted_by = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.pre_authorizations p
    WHERE p.id = preauth_email_log.preauth_id
      AND p.facility_id IS NOT NULL
      AND security_internal.user_has_facility_access(p.facility_id)
  )
);
