do $$
declare
  v_definition text;
  v_original text;
  v_old_tax_amount_declaration constant text := '  v_tax_rate numeric;';
  v_old_tax_amount_added constant text := '  v_tax_rate numeric;\n  v_old_tax_amount numeric;';
  v_old_claim_vars_declaration constant text := '  v_tax_rate numeric;\n  v_old_tax_amount numeric;';
  v_old_claim_vars_added constant text := '  v_tax_rate numeric;\n  v_old_tax_amount numeric;\n  v_old_claim_month integer;\n  v_old_claim_year integer;\n  v_old_claim_status text;\n  v_old_claim_patient_name text;\n  v_old_claim_procedure_name text;\n  v_old_claim_preauth_id uuid;\n  v_old_claim_submission_date date;';
  v_old text;
  v_new text;
begin
  select pg_get_functiondef('public.ingest_document_records(text,text,jsonb)'::regprocedure)
    into v_definition;

  if v_definition is null then
    raise exception 'ingest_document_records function does not exist';
  end if;

  v_original := v_definition;

  if position(v_old_tax_amount_declaration in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_tax_amount_declaration, v_old_tax_amount_added);
  end if;

  if position(v_old_claim_vars_declaration in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_claim_vars_declaration, v_old_claim_vars_added);
  end if;

  v_old := $$select id, claim_amount, claim_month, claim_year, status, patient_name, procedure_name, submission_date
          into v_match_id, v_old_numeric, v_claim_month, v_claim_year, v_old_text, v_old_text_2, v_old_text_2, v_old_date$$;
  v_new := $$select id, claim_amount, claim_month, claim_year, status, patient_name, procedure_name, submission_date
          into v_match_id, v_old_numeric, v_old_claim_month, v_old_claim_year, v_old_claim_status, v_old_claim_patient_name, v_old_claim_procedure_name, v_old_claim_submission_date$$;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $$select claim_amount, claim_month, claim_year, status, patient_name, procedure_name, preauth_id, submission_date, expected_payment_date, denial_category, denial_notes, denial_reason, root_cause, submitted_at, approved_at, paid_at, appeal_status, appeal_outcome, appeal_filed_at
          into v_old_numeric, v_claim_month, v_claim_year, v_old_text, v_old_text_2, v_old_text_2, v_old_uuid, v_old_date, v_old_date, v_old_text_2, v_old_text_2, v_old_text_2, v_old_text_2, v_old_date, v_old_date, v_old_date, v_old_text_2, v_old_text_2, v_old_date$$;
  v_new := $$select claim_amount, claim_month, claim_year, status
          into v_old_numeric, v_old_claim_month, v_old_claim_year, v_old_claim_status$$;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $$select patient_name, procedure_name, preauth_id, submission_date, expected_payment_date, denial_category, denial_notes, denial_reason, root_cause, submitted_at, approved_at, paid_at, appeal_status, appeal_outcome, appeal_filed_at
          into v_old_text, v_old_text_2, v_old_uuid, v_old_date, v_old_date, v_old_text_2, v_old_text_2, v_old_text_2, v_old_text_2, v_old_date, v_old_date, v_old_date, v_old_text_2, v_old_text_2, v_old_date$$;
  v_new := $$select patient_name, procedure_name, preauth_id
          into v_old_claim_patient_name, v_old_claim_procedure_name, v_old_claim_preauth_id$$;
  v_definition := replace(v_definition, v_old, v_new);

  v_definition := replace(v_definition,
    'if v_claim_month is distinct from nullif(v_data->>''claim_month'','''')::integer then v_conflict_fields := v_conflict_fields || jsonb_build_object(''claim_month'', jsonb_build_object(''from'', v_claim_month, ''to'', nullif(v_data->>''claim_month'','''')::integer)); end if;',
    'if v_old_claim_month is distinct from nullif(v_data->>''claim_month'','''')::integer then v_conflict_fields := v_conflict_fields || jsonb_build_object(''claim_month'', jsonb_build_object(''from'', v_old_claim_month, ''to'', nullif(v_data->>''claim_month'','''')::integer)); end if;');
  v_definition := replace(v_definition,
    'if v_claim_year is distinct from nullif(v_data->>''claim_year'','''')::integer then v_conflict_fields := v_conflict_fields || jsonb_build_object(''claim_year'', jsonb_build_object(''from'', v_claim_year, ''to'', nullif(v_data->>''claim_year'','''')::integer)); end if;',
    'if v_old_claim_year is distinct from nullif(v_data->>''claim_year'','''')::integer then v_conflict_fields := v_conflict_fields || jsonb_build_object(''claim_year'', jsonb_build_object(''from'', v_old_claim_year, ''to'', nullif(v_data->>''claim_year'','''')::integer)); end if;');
  v_definition := replace(v_definition,
    'if lower(coalesce(v_old_text,'''')) <> lower(v_status) then v_conflict_fields := v_conflict_fields || jsonb_build_object(''status'', jsonb_build_object(''from'', v_old_text, ''to'', v_status)); end if;',
    'if lower(coalesce(v_old_claim_status,'''')) <> lower(v_status) then v_conflict_fields := v_conflict_fields || jsonb_build_object(''status'', jsonb_build_object(''from'', v_old_claim_status, ''to'', v_status)); end if;');
  v_definition := replace(v_definition,
    'if v_patient_name is not null then if v_old_text is null then v_changed_fields := v_changed_fields || jsonb_build_object(''patient_name'', jsonb_build_object(''from'', null, ''to'', v_patient_name)); elsif lower(v_old_text) <> lower(v_patient_name) then v_conflict_fields := v_conflict_fields || jsonb_build_object(''patient_name'', jsonb_build_object(''from'', v_old_text, ''to'', v_patient_name)); end if; end if;',
    'if v_patient_name is not null then if v_old_claim_patient_name is null then v_changed_fields := v_changed_fields || jsonb_build_object(''patient_name'', jsonb_build_object(''from'', null, ''to'', v_patient_name)); elsif lower(v_old_claim_patient_name) <> lower(v_patient_name) then v_conflict_fields := v_conflict_fields || jsonb_build_object(''patient_name'', jsonb_build_object(''from'', v_old_claim_patient_name, ''to'', v_patient_name)); end if; end if;');
  v_definition := replace(v_definition,
    'if v_procedure_name is not null then if v_old_text_2 is null then v_changed_fields := v_changed_fields || jsonb_build_object(''procedure_name'', jsonb_build_object(''from'', null, ''to'', v_procedure_name)); elsif lower(v_old_text_2) <> lower(v_procedure_name) then v_conflict_fields := v_conflict_fields || jsonb_build_object(''procedure_name'', jsonb_build_object(''from'', v_old_text_2, ''to'', v_procedure_name)); end if; end if;',
    'if v_procedure_name is not null then if v_old_claim_procedure_name is null then v_changed_fields := v_changed_fields || jsonb_build_object(''procedure_name'', jsonb_build_object(''from'', null, ''to'', v_procedure_name)); elsif lower(v_old_claim_procedure_name) <> lower(v_procedure_name) then v_conflict_fields := v_conflict_fields || jsonb_build_object(''procedure_name'', jsonb_build_object(''from'', v_old_claim_procedure_name, ''to'', v_procedure_name)); end if; end if;');
  v_definition := replace(v_definition,
    'if v_pre_auth_id is not null and v_old_uuid is null then v_changed_fields := v_changed_fields || jsonb_build_object(''preauth_id'', jsonb_build_object(''from'', null, ''to'', v_pre_auth_id)); elsif v_pre_auth_id is not null and v_old_uuid is distinct from v_pre_auth_id then v_conflict_fields := v_conflict_fields || jsonb_build_object(''preauth_id'', jsonb_build_object(''from'', v_old_uuid, ''to'', v_pre_auth_id)); end if;',
    'if v_pre_auth_id is not null and v_old_claim_preauth_id is null then v_changed_fields := v_changed_fields || jsonb_build_object(''preauth_id'', jsonb_build_object(''from'', null, ''to'', v_pre_auth_id)); elsif v_pre_auth_id is not null and v_old_claim_preauth_id is distinct from v_pre_auth_id then v_conflict_fields := v_conflict_fields || jsonb_build_object(''preauth_id'', jsonb_build_object(''from'', v_old_claim_preauth_id, ''to'', v_pre_auth_id)); end if;');

  v_old := $$select id, claim_amount, claim_month, claim_year, status, patient_name, procedure_name, submission_date
          into v_match_id, v_old_numeric, v_claim_month, v_claim_year, v_old_text, v_old_text_2, v_old_text_2, v_old_date
        from public.claims where insurance_company_id = v_company_id and preauth_id = v_pre_auth_id order by id limit 1 for update;$$;
  v_new := $$select id, claim_amount, claim_month, claim_year, status, patient_name, procedure_name, submission_date
          into v_match_id, v_old_numeric, v_old_claim_month, v_old_claim_year, v_old_claim_status, v_old_claim_patient_name, v_old_claim_procedure_name, v_old_claim_submission_date
        from public.claims where insurance_company_id = v_company_id and preauth_id = v_pre_auth_id order by id limit 1 for update;$$;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $$select id, claim_amount, claim_month, claim_year, status, patient_name, procedure_name, submission_date
          into v_match_id, v_old_numeric, v_claim_month, v_claim_year, v_old_text, v_old_text_2, v_old_text_2, v_old_date
        from public.claims where insurance_company_id = v_company_id and claim_month = v_claim_month and claim_year = v_claim_year and lower(coalesce(patient_name,'')) = lower(v_patient_name) and lower(coalesce(procedure_name,'')) = lower(v_procedure_name) and submission_date = v_submission_date order by id limit 1 for update;$$;
  v_new := $$select id, claim_amount, claim_month, claim_year, status, patient_name, procedure_name, submission_date
          into v_match_id, v_old_numeric, v_old_claim_month, v_old_claim_year, v_old_claim_status, v_old_claim_patient_name, v_old_claim_procedure_name, v_old_claim_submission_date
        from public.claims where insurance_company_id = v_company_id and claim_month = v_claim_month and claim_year = v_claim_year and lower(coalesce(patient_name,'')) = lower(v_patient_name) and lower(coalesce(procedure_name,'')) = lower(v_procedure_name) and submission_date = v_submission_date order by id limit 1 for update;$$;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $$select id, claim_amount, claim_month, claim_year, status, patient_name, procedure_name, submission_date
          into v_match_id, v_old_numeric, v_claim_month, v_claim_year, v_old_text, v_old_text_2, v_old_text_2, v_old_date
        from public.claims where insurance_company_id = v_company_id and preauth_id = v_pre_auth_id order by id limit 1 for update;$$;
  if v_definition = v_original then
    raise exception 'Document ingest hardening patch did not match the expected function definition';
  end if;

  v_old := $$select id, claim_amount, claim_month, claim_year, status, patient_name, procedure_name, submission_date
          into v_match_id, v_old_numeric, v_claim_month, v_claim_year, v_old_text, v_old_text_2, v_old_text_2, v_old_date
        from public.claims where insurance_company_id = v_company_id and preauth_id = v_pre_auth_id order by id limit 1 for update;$$;
  v_new := $$select id, claim_amount, claim_month, claim_year, status, patient_name, procedure_name, submission_date
          into v_match_id, v_old_numeric, v_old_claim_month, v_old_claim_year, v_old_claim_status, v_old_claim_patient_name, v_old_claim_procedure_name, v_old_claim_submission_date
        from public.claims where insurance_company_id = v_company_id and preauth_id = v_pre_auth_id order by id limit 1 for update;$$;

  v_old := $$select id, claim_total, tax_rate, tax_amount into v_match_id, v_old_numeric, v_tax_rate, v_tax_amount from public.withholding_tax where insurance_company_id = v_company_id and month = v_month and year = v_year order by id limit 1 for update;$$;
  v_new := $$select id, claim_total, tax_rate, tax_amount into v_match_id, v_old_numeric, v_old_numeric_2, v_old_tax_amount from public.withholding_tax where insurance_company_id = v_company_id and month = v_month and year = v_year order by id limit 1 for update;$$;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $$select claim_total, tax_rate, tax_amount into v_old_numeric, v_old_numeric_2, v_old_numeric from public.withholding_tax where id = v_match_id;$$;
  v_new := $$select claim_total, tax_rate, tax_amount into v_old_numeric, v_old_numeric_2, v_old_tax_amount from public.withholding_tax where id = v_match_id;$$;
  v_definition := replace(v_definition, v_old, v_new);

  v_definition := replace(v_definition,
    'if v_tax_amount is distinct from v_old_numeric then v_conflict_fields := v_conflict_fields || jsonb_build_object(''tax_amount'', jsonb_build_object(''from'', v_old_numeric, ''to'', v_tax_amount)); end if;',
    'if v_tax_amount is distinct from v_old_tax_amount then v_conflict_fields := v_conflict_fields || jsonb_build_object(''tax_amount'', jsonb_build_object(''from'', v_old_tax_amount, ''to'', v_tax_amount)); end if;');
  v_definition := replace(v_definition,
    'elsif v_claim_total is not null and v_old_numeric is distinct from v_claim_total then v_conflict_fields := v_conflict_fields || jsonb_build_object(''claim_total'', jsonb_build_object(''from'', v_old_numeric, ''to'', v_claim_total)); end if;',
    'elsif v_claim_total is not null and v_old_numeric is distinct from v_claim_total then v_conflict_fields := v_conflict_fields || jsonb_build_object(''claim_total'', jsonb_build_object(''from'', v_old_numeric, ''to'', v_claim_total)); end if;');

  execute v_definition;
end;
$$;
