-- Repair ambiguous output-column references in facility membership upserts.
-- The RPCs return TABLE columns named facility_id/user_id; using those names
-- in ON CONFLICT column lists can resolve to PL/pgSQL output variables.
-- Constraint-name inference is unambiguous and preserves the same uniqueness rule.
DO $migration$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_signatures text[] := ARRAY[
    'security_internal.create_facility_with_owner(text,text,text,text,text,text)',
    'security_internal.add_facility_member_by_email(uuid,text,text)'
  ];
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY v_signatures LOOP
    v_signature := to_regprocedure(v_name);
    IF v_signature IS NULL THEN
      CONTINUE;
    END IF;

    v_definition := pg_get_functiondef(v_signature);
    IF position('ON CONFLICT (facility_id, user_id)' IN v_definition) > 0 THEN
      v_definition := replace(
        v_definition,
        'ON CONFLICT (facility_id, user_id)',
        'ON CONFLICT ON CONSTRAINT facility_membership_unique'
      );
      EXECUTE v_definition;
    END IF;

    IF position('ON CONFLICT (facility_id, user_id)' IN pg_get_functiondef(v_signature)) > 0 THEN
      RAISE EXCEPTION 'Ambiguous facility membership conflict target remains in %', v_name;
    END IF;
  END LOOP;
END;
$migration$;
