-- Secure facility onboarding and membership management for global superusers/admins.
-- Membership role is descriptive only; application permissions remain in user_roles/role_permissions.
CREATE OR REPLACE FUNCTION security_internal.create_facility_with_owner(
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
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_code text := upper(trim(coalesce(p_code, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_country text := nullif(upper(trim(coalesce(p_country_code, ''))), '');
  v_timezone text := trim(coalesce(p_timezone, 'UTC'));
  v_currency text := upper(trim(coalesce(p_default_currency, 'USD')));
  v_date_format text := trim(coalesce(p_date_format, 'YYYY-MM-DD'));
  v_facility_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;
  IF NOT security_internal.current_user_has_any_role(ARRAY['superuser'::public.app_role, 'admin'::public.app_role])
     OR NOT security_internal.current_user_has_permission('settings.manage') THEN
    RAISE EXCEPTION 'Only an authorized system administrator can create a facility';
  END IF;
  IF v_code !~ '^[A-Z0-9][A-Z0-9_-]{1,19}$' THEN
    RAISE EXCEPTION 'Facility code must be 2-20 characters using letters, numbers, hyphens or underscores';
  END IF;
  IF length(v_name) < 2 OR length(v_name) > 160 THEN
    RAISE EXCEPTION 'Facility name must be between 2 and 160 characters';
  END IF;
  IF v_country IS NOT NULL AND v_country !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'Country must be a two-letter ISO 3166-1 alpha-2 code';
  END IF;
  IF v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be a three-letter ISO 4217 code';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names tz WHERE tz.name = v_timezone) THEN
    RAISE EXCEPTION 'Select a valid IANA time zone';
  END IF;
  IF v_date_format NOT IN ('YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD-MM-YYYY', 'MM-DD-YYYY') THEN
    RAISE EXCEPTION 'Unsupported facility date format';
  END IF;

  v_facility_id := gen_random_uuid();
  INSERT INTO public.facilities (
    id, code, name, country_code, timezone, default_currency, date_format, active
  ) VALUES (
    v_facility_id, v_code, v_name, v_country, v_timezone, v_currency, v_date_format, true
  );

  INSERT INTO public.facility_memberships (facility_id, user_id, role, status)
  VALUES (v_facility_id, v_user_id, 'owner', 'active')
  ON CONFLICT (facility_id, user_id)
  DO UPDATE SET role = 'owner', status = 'active', updated_at = now();

  INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
  VALUES (
    'facilities', v_facility_id::text, 'create',
    NULL,
    jsonb_build_object('id', v_facility_id, 'code', v_code, 'name', v_name, 'country_code', v_country, 'timezone', v_timezone, 'default_currency', v_currency),
    v_user_id
  );

  RETURN QUERY SELECT v_facility_id, v_code, v_name;
END;
$function$;

CREATE OR REPLACE FUNCTION security_internal.add_facility_member_by_email(
  p_facility_id uuid,
  p_email text,
  p_membership_role text DEFAULT 'member'
)
RETURNS TABLE (membership_id uuid, user_id uuid, email text, membership_role text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_target_user_id uuid;
  v_email text;
  v_membership_id uuid;
  v_existing_membership public.facility_memberships%ROWTYPE;
  v_old_data jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;
  IF NOT security_internal.current_user_has_any_role(ARRAY['superuser'::public.app_role, 'admin'::public.app_role])
     OR NOT security_internal.current_user_has_permission('settings.manage')
     OR NOT security_internal.current_user_has_permission('users.manage') THEN
    RAISE EXCEPTION 'System administrator permissions are required to manage facility membership';
  END IF;
  -- Serialize membership changes per facility so concurrent owner demotions or
  -- suspensions cannot both pass the last-owner check.
  IF p_facility_id IS NULL THEN
    RAISE EXCEPTION 'Select an active facility';
  END IF;
  PERFORM 1 FROM public.facilities f
  WHERE f.id = p_facility_id AND f.active = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Select an active facility';
  END IF;
  IF coalesce(length(trim(p_email)), 0) = 0 THEN
    RAISE EXCEPTION 'A registered user email is required';
  END IF;
  IF coalesce(p_membership_role, '') NOT IN ('owner', 'member', 'viewer') THEN
    RAISE EXCEPTION 'Facility membership role must be owner, member or viewer';
  END IF;

  SELECT u.id, u.email INTO v_target_user_id, v_email
  FROM auth.users u
  WHERE lower(u.email) = lower(trim(p_email))
  ORDER BY u.created_at DESC
  LIMIT 1;
  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'No CareFlow account exists for that email. Create the account in User Management first.';
  END IF;

  SELECT fm.* INTO v_existing_membership
  FROM public.facility_memberships fm
  WHERE fm.facility_id = p_facility_id AND fm.user_id = v_target_user_id
  FOR UPDATE;

  IF FOUND THEN
    v_old_data := to_jsonb(v_existing_membership);
    IF v_existing_membership.role = 'owner'
       AND v_existing_membership.status = 'active'
       AND p_membership_role <> 'owner'
       AND (
         SELECT count(*) FROM public.facility_memberships fm
         WHERE fm.facility_id = p_facility_id
           AND fm.role = 'owner' AND fm.status = 'active'
       ) <= 1 THEN
      RAISE EXCEPTION 'A facility must retain at least one active owner';
    END IF;
  END IF;

  INSERT INTO public.facility_memberships (facility_id, user_id, role, status)
  VALUES (p_facility_id, v_target_user_id, p_membership_role, 'active')
  ON CONFLICT (facility_id, user_id)
  DO UPDATE SET role = EXCLUDED.role, status = 'active', updated_at = now()
  RETURNING id INTO v_membership_id;

  INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
  VALUES (
    'facility_memberships', v_membership_id::text, 'upsert',
    v_old_data,
    jsonb_build_object('facility_id', p_facility_id, 'user_id', v_target_user_id, 'email', v_email, 'role', p_membership_role, 'status', 'active'),
    v_actor_id
  );

  RETURN QUERY SELECT v_membership_id, v_target_user_id, v_email, p_membership_role, 'active'::text;
END;
$function$;

CREATE OR REPLACE FUNCTION security_internal.deactivate_facility_member(
  p_membership_id uuid,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_facility_id uuid;
  v_membership public.facility_memberships%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;
  IF NOT security_internal.current_user_has_any_role(ARRAY['superuser'::public.app_role, 'admin'::public.app_role])
     OR NOT security_internal.current_user_has_permission('settings.manage')
     OR NOT security_internal.current_user_has_permission('users.manage') THEN
    RAISE EXCEPTION 'System administrator permissions are required to manage facility membership';
  END IF;
  IF coalesce(length(trim(p_reason)), 0) = 0 THEN
    RAISE EXCEPTION 'A reason is required when suspending facility access';
  END IF;

  -- Read the facility id first, then take locks in the same facility-before-
  -- membership order used by add_facility_member_by_email.
  SELECT fm.facility_id INTO v_facility_id
  FROM public.facility_memberships fm
  WHERE fm.id = p_membership_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Facility membership not found';
  END IF;

  PERFORM 1 FROM public.facilities f
  WHERE f.id = v_facility_id
  FOR UPDATE;

  SELECT fm.* INTO v_membership
  FROM public.facility_memberships fm
  WHERE fm.id = p_membership_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Facility membership not found';
  END IF;
  IF v_membership.status = 'suspended' THEN
    RETURN true;
  END IF;
  IF v_membership.role = 'owner' AND v_membership.status = 'active'
     AND (SELECT count(*) FROM public.facility_memberships fm
          WHERE fm.facility_id = v_membership.facility_id
            AND fm.role = 'owner' AND fm.status = 'active') <= 1 THEN
    RAISE EXCEPTION 'A facility must retain at least one active owner';
  END IF;

  UPDATE public.facility_memberships
  SET status = 'suspended', updated_at = now()
  WHERE id = p_membership_id;

  INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
  VALUES (
    'facility_memberships', p_membership_id::text, 'suspend',
    to_jsonb(v_membership),
    jsonb_build_object('facility_id', v_membership.facility_id, 'user_id', v_membership.user_id, 'role', v_membership.role, 'status', 'suspended', 'reason', trim(p_reason)),
    v_actor_id
  );
  RETURN true;
END;
$function$;

-- Keep mutation logic in the private schema. Each helper verifies the caller's
-- system-administrator role and required settings/users permissions.
REVOKE ALL ON FUNCTION security_internal.create_facility_with_owner(text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION security_internal.add_facility_member_by_email(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION security_internal.deactivate_facility_member(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION security_internal.create_facility_with_owner(text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION security_internal.add_facility_member_by_email(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION security_internal.deactivate_facility_member(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_facility_with_owner(
  p_code text,
  p_name text,
  p_country_code text DEFAULT NULL,
  p_timezone text DEFAULT 'UTC',
  p_default_currency text DEFAULT 'USD',
  p_date_format text DEFAULT 'YYYY-MM-DD'
)
RETURNS TABLE (facility_id uuid, facility_code text, facility_name text)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $wrapper$
  SELECT * FROM security_internal.create_facility_with_owner(
    p_code, p_name, p_country_code, p_timezone, p_default_currency, p_date_format
  );
$wrapper$;

CREATE OR REPLACE FUNCTION public.add_facility_member_by_email(
  p_facility_id uuid,
  p_email text,
  p_membership_role text DEFAULT 'member'
)
RETURNS TABLE (membership_id uuid, user_id uuid, email text, membership_role text, status text)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $wrapper$
  SELECT * FROM security_internal.add_facility_member_by_email(
    p_facility_id, p_email, p_membership_role
  );
$wrapper$;

CREATE OR REPLACE FUNCTION public.deactivate_facility_member(
  p_membership_id uuid,
  p_reason text
)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $wrapper$
  SELECT security_internal.deactivate_facility_member(p_membership_id, p_reason);
$wrapper$;

REVOKE ALL ON FUNCTION public.create_facility_with_owner(text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_facility_member_by_email(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deactivate_facility_member(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_facility_with_owner(text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_facility_member_by_email(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_facility_member(uuid, text) TO authenticated;
