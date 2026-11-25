-- Allow the claims-settlement scoped write permission to operate the
-- exception register without granting the broader payments.write capability.
-- The migration is safe on environments where the base lifecycle functions
-- are absent or already contain the scoped permission.
DO $migration$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_old text := 'IF NOT security_internal.current_user_has_permission(''payments.write'') THEN';
  v_new text := 'IF NOT (security_internal.current_user_has_permission(''payments.write'') OR security_internal.current_user_has_permission(''claims.settlement.write'')) THEN';
  v_signatures text[] := ARRAY[
    'security_internal.record_settlement_exception(uuid,text,text,text,text)',
    'security_internal.transition_settlement_exception_atomic(uuid,text,text)'
  ];
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY v_signatures LOOP
    v_signature := to_regprocedure(v_name);
    IF v_signature IS NULL THEN
      CONTINUE;
    END IF;

    v_definition := pg_get_functiondef(v_signature);
    IF position('claims.settlement.write' IN v_definition) = 0 THEN
      IF position(v_old IN v_definition) = 0 THEN
        RAISE EXCEPTION 'Expected payments.write guard was not found in %', v_name;
      END IF;
      v_definition := replace(v_definition, v_old, v_new);
      EXECUTE v_definition;
    END IF;

    IF position('claims.settlement.write' IN pg_get_functiondef(v_signature)) = 0 THEN
      RAISE EXCEPTION 'Scoped claims settlement permission is missing from %', v_name;
    END IF;
  END LOOP;
END;
$migration$;
