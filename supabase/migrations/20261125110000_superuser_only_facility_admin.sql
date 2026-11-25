-- Facility administration is a superuser-only control plane.
-- Ordinary facility members retain access to their own facility-scoped workflows.
-- These public RPC wrappers enforce the role boundary server-side; the private
-- mutation helpers are no longer directly executable by authenticated clients.

CREATE OR REPLACE FUNCTION public.create_facility_with_owner(
  p_code text,
  p_name text,
  p_country_code text DEFAULT NULL,
  p_timezone text DEFAULT 'UTC',
  p_default_currency text DEFAULT 'USD',
  p_date_format text DEFAULT 'YYYY-MM-DD'
)
RETURNS TABLE (facility_id uuid, facility_code text, facility_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT security_internal.current_user_has_any_role(ARRAY['superuser'::public.app_role]) THEN
    RAISE EXCEPTION 'Only a superuser can administer facilities' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT * FROM security_internal.create_facility_with_owner(
      p_code, p_name, p_country_code, p_timezone, p_default_currency, p_date_format
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_facility_member_by_email(
  p_facility_id uuid,
  p_email text,
  p_membership_role text DEFAULT 'member'
)
RETURNS TABLE (membership_id uuid, user_id uuid, email text, membership_role text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT security_internal.current_user_has_any_role(ARRAY['superuser'::public.app_role]) THEN
    RAISE EXCEPTION 'Only a superuser can administer facility access' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT * FROM security_internal.add_facility_member_by_email(
      p_facility_id, p_email, p_membership_role
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.deactivate_facility_member(
  p_membership_id uuid,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT security_internal.current_user_has_any_role(ARRAY['superuser'::public.app_role]) THEN
    RAISE EXCEPTION 'Only a superuser can administer facility access' USING ERRCODE = '42501';
  END IF;
  RETURN security_internal.deactivate_facility_member(p_membership_id, p_reason);
END;
$function$;

-- Prevent bypassing the guarded public entry points via the private helpers.
REVOKE ALL ON FUNCTION security_internal.create_facility_with_owner(text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION security_internal.add_facility_member_by_email(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION security_internal.deactivate_facility_member(uuid, text) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.create_facility_with_owner(text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_facility_member_by_email(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deactivate_facility_member(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_facility_with_owner(text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_facility_member_by_email(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_facility_member(uuid, text) TO authenticated;

-- Global facility and membership administration visibility is superuser-only.
-- Membership-based access for ordinary users remains available.
DROP POLICY IF EXISTS facilities_select_member ON public.facilities;
CREATE POLICY facilities_select_member ON public.facilities
  FOR SELECT TO authenticated
  USING (
    public.user_has_facility_access(facilities.id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid()) AND ur.role = 'superuser'
    )
  );

DROP POLICY IF EXISTS facility_memberships_select_member ON public.facility_memberships;
CREATE POLICY facility_memberships_select_member ON public.facility_memberships
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR public.user_has_facility_access(facility_memberships.facility_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid()) AND ur.role = 'superuser'
    )
  );

COMMENT ON FUNCTION public.create_facility_with_owner(text, text, text, text, text, text)
  IS 'Superuser-only facility creation and initial owner assignment.';
COMMENT ON FUNCTION public.add_facility_member_by_email(uuid, text, text)
  IS 'Superuser-only facility membership administration.';
COMMENT ON FUNCTION public.deactivate_facility_member(uuid, text)
  IS 'Superuser-only facility membership suspension.';
