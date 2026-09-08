-- Prevent authenticated clients from changing privileged role assignments directly.
-- Role changes are performed only through the hardened admin-user-action Edge Function,
-- which authenticates the caller and uses the service role server-side.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_roles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_roles', r.policyname);
  END LOOP;
END $$;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- A signed-in user may inspect only their own role. Administrative listings use the
-- server-side Edge Function with service-role credentials and therefore bypass RLS.
CREATE POLICY user_roles_select_self
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Deliberately no INSERT/UPDATE/DELETE policies are granted to authenticated users.
-- This makes browser-side role escalation impossible through the Data API.
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;
GRANT SELECT ON public.user_roles TO authenticated;

COMMENT ON TABLE public.user_roles IS
  'Role assignments are immutable from the client Data API. Administrative changes must use the server-side account-management service.';
