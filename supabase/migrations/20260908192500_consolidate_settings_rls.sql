-- Avoid duplicate permissive SELECT policies on system settings.
DROP POLICY IF EXISTS system_settings_select_permission ON public.system_settings;
-- system_settings_manage_permission already covers SELECT/INSERT/UPDATE/DELETE
-- for users holding settings.manage.
