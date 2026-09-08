-- Harden remaining legacy RLS policies flagged by the Supabase advisors.
-- This also removes the broad preauth client-suggestion policies that bypassed
-- facility/permission boundaries.

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Authenticated read system_settings" ON public.system_settings;
DROP POLICY IF EXISTS "Superusers manage settings" ON public.system_settings;
CREATE POLICY system_settings_select_permission
  ON public.system_settings FOR SELECT TO authenticated
  USING (public.current_user_has_permission('settings.manage'));
CREATE POLICY system_settings_manage_permission
  ON public.system_settings FOR ALL TO authenticated
  USING (public.current_user_has_permission('settings.manage'))
  WITH CHECK (public.current_user_has_permission('settings.manage'));

DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "System insert notifications" ON public.notifications;
CREATE POLICY notifications_insert_scoped
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    OR public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );

DROP POLICY IF EXISTS "Users read own or broadcast messages" ON public.chat_messages;
CREATE POLICY "Users read own or broadcast messages"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (is_broadcast OR sender_id = (select auth.uid()) OR recipient_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users send messages as self" ON public.chat_messages;
CREATE POLICY "Users send messages as self"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = (select auth.uid()));

DROP POLICY IF EXISTS "Recipient can mark read" ON public.chat_messages;
CREATE POLICY "Recipient can mark read"
  ON public.chat_messages FOR UPDATE TO authenticated
  USING (recipient_id = (select auth.uid()) OR is_broadcast)
  WITH CHECK (recipient_id = (select auth.uid()) OR is_broadcast);

-- Client suggestions are tenant data. A suggestion must belong to a facility
-- and can only be changed by a user with preauth write permission.
DROP POLICY IF EXISTS "Authenticated users can create preauth client suggestions" ON public.preauth_client_suggestions;
DROP POLICY IF EXISTS "Authenticated users can update preauth client suggestions" ON public.preauth_client_suggestions;
DROP POLICY IF EXISTS "Authenticated users can view preauth client suggestions" ON public.preauth_client_suggestions;

CREATE POLICY preauth_client_suggestions_select_scoped
  ON public.preauth_client_suggestions FOR SELECT TO authenticated
  USING (
    facility_id IS NOT NULL
    AND public.user_has_facility_access(facility_id)
    AND public.current_user_has_permission('preauth.read')
  );
CREATE POLICY preauth_client_suggestions_insert_scoped
  ON public.preauth_client_suggestions FOR INSERT TO authenticated
  WITH CHECK (
    facility_id IS NOT NULL
    AND public.user_has_facility_access(facility_id)
    AND created_by = (select auth.uid())
    AND public.current_user_has_permission('preauth.write')
  );
CREATE POLICY preauth_client_suggestions_update_scoped
  ON public.preauth_client_suggestions FOR UPDATE TO authenticated
  USING (
    facility_id IS NOT NULL
    AND public.user_has_facility_access(facility_id)
    AND public.current_user_has_permission('preauth.write')
  )
  WITH CHECK (
    facility_id IS NOT NULL
    AND public.user_has_facility_access(facility_id)
    AND public.current_user_has_permission('preauth.write')
  );
CREATE POLICY preauth_client_suggestions_delete_admin
  ON public.preauth_client_suggestions FOR DELETE TO authenticated
  USING (
    facility_id IS NOT NULL
    AND public.user_has_facility_access(facility_id)
    AND public.current_user_has_any_role(ARRAY['superuser','admin']::public.app_role[])
  );
