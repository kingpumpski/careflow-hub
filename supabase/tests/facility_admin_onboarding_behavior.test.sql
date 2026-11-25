-- Behavioral integration test for facility onboarding and owner safety.
-- Runs in a disposable PostgreSQL transaction and rolls back all fixtures.
-- This test exercises authenticated RPC behavior; row-lock serialization is
-- separately asserted by facility_admin_onboarding.test.sql.
BEGIN;

DO $fixtures$
DECLARE
  v_admin_id uuid := '8c9a1b2c-3d4e-4f50-8123-000000000001';
  v_member_id uuid := '8c9a1b2c-3d4e-4f50-8123-000000000002';
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_admin_id, 'authenticated', 'authenticated', 'facility-test-admin@example.invalid',
     'test-only-password-hash', now(), '{}'::jsonb, '{"full_name":"Facility Test Admin"}'::jsonb, now(), now()),
    (v_member_id, 'authenticated', 'authenticated', 'facility-test-member@example.invalid',
     'test-only-password-hash', now(), '{}'::jsonb, '{"full_name":"Facility Test Member"}'::jsonb, now(), now())
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.user_roles
  SET role = 'admin'::public.app_role
  WHERE user_id = v_admin_id;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_admin_id AND role = 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Test administrator role fixture was not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_member_id AND role = 'viewer'::public.app_role) THEN
    RAISE EXCEPTION 'Test viewer role fixture was not created';
  END IF;
END;
$fixtures$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '8c9a1b2c-3d4e-4f50-8123-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"8c9a1b2c-3d4e-4f50-8123-000000000001","role":"authenticated"}', true);

DO $behavior$
DECLARE
  v_admin_id uuid := '8c9a1b2c-3d4e-4f50-8123-000000000001';
  v_member_id uuid := '8c9a1b2c-3d4e-4f50-8123-000000000002';
  v_facility_id uuid;
  v_owner_membership_id uuid;
  v_member_count integer;
  v_rejected boolean;
BEGIN
  SELECT created.facility_id INTO v_facility_id
  FROM public.create_facility_with_owner(
    'CFTEST001', 'CareFlow Onboarding Test', 'GH', 'Africa/Accra', 'GHS', 'DD/MM/YYYY'
  ) AS created;

  IF v_facility_id IS NULL THEN
    RAISE EXCEPTION 'Facility creation did not return a facility id';
  END IF;

  SELECT fm.id INTO v_owner_membership_id
  FROM public.facility_memberships fm
  WHERE fm.facility_id = v_facility_id
    AND fm.user_id = v_admin_id
    AND fm.role = 'owner'
    AND fm.status = 'active';

  IF v_owner_membership_id IS NULL THEN
    RAISE EXCEPTION 'Facility creation must atomically assign its creator as active owner';
  END IF;

  PERFORM * FROM public.add_facility_member_by_email(
    v_facility_id, 'facility-test-member@example.invalid', 'viewer'
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.facility_memberships fm
    WHERE fm.facility_id = v_facility_id
      AND fm.user_id = v_member_id
      AND fm.role = 'viewer'
      AND fm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Existing registered user was not added with the requested membership role';
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM * FROM public.add_facility_member_by_email(
      v_facility_id, 'facility-test-admin@example.invalid', 'member'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%A facility must retain at least one active owner%' THEN
      v_rejected := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'Demoting the last active facility owner should be rejected';
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM public.deactivate_facility_member(v_owner_membership_id, 'Behavioral test: last owner protection');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%A facility must retain at least one active owner%' THEN
      v_rejected := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'Suspending the last active facility owner should be rejected';
  END IF;

  SELECT count(*) INTO v_member_count
  FROM public.facility_memberships fm
  WHERE fm.facility_id = v_facility_id
    AND fm.role = 'owner'
    AND fm.status = 'active';
  IF v_member_count <> 1 THEN
    RAISE EXCEPTION 'Rejected owner mutations must leave exactly one active owner; found %', v_member_count;
  END IF;

  -- A normal viewer must not be able to administer facility membership.
  PERFORM set_config('request.jwt.claim.sub', v_member_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_member_id, 'role', 'authenticated')::text, true);
  v_rejected := false;
  BEGIN
    PERFORM * FROM public.add_facility_member_by_email(
      v_facility_id, 'facility-test-member@example.invalid', 'owner'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%System administrator permissions are required%' THEN
      v_rejected := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'A viewer must not be able to grant facility ownership';
  END IF;

  -- Restore actor identity for any subsequent assertions in this transaction.
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);

  IF NOT EXISTS (
    SELECT 1 FROM public.audit_logs al
    WHERE al.table_name = 'facilities'
      AND al.record_id = v_facility_id::text
      AND al.action = 'create'
  ) THEN
    RAISE EXCEPTION 'Facility creation must emit an audit record';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.audit_logs al
    WHERE al.table_name = 'facility_memberships'
      AND al.action = 'upsert'
      AND al.changed_by = v_admin_id
  ) THEN
    RAISE EXCEPTION 'Membership creation must emit an audit record';
  END IF;
END;
$behavior$;

RESET ROLE;
ROLLBACK;
