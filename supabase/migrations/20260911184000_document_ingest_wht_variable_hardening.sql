do $do$
declare
  v_definition text;
  v_original text;
begin
  select pg_get_functiondef('public.ingest_document_records(text,text,jsonb)'::regprocedure)
    into v_definition;

  if v_definition is null then
    raise exception 'ingest_document_records function does not exist';
  end if;

  v_original := v_definition;

  v_definition := replace(
    v_definition,
    '  v_tax_rate numeric;',
    '  v_tax_rate numeric;\n  v_old_tax_amount numeric;'
  );

  v_definition := replace(
    v_definition,
    $sql$select id, claim_total, tax_rate, tax_amount into v_match_id, v_old_numeric, v_tax_rate, v_tax_amount from public.withholding_tax where insurance_company_id = v_company_id and month = v_month and year = v_year order by id limit 1 for update;$sql$,
    $sql$select id, claim_total, tax_rate, tax_amount into v_match_id, v_old_numeric, v_old_numeric_2, v_old_tax_amount from public.withholding_tax where insurance_company_id = v_company_id and month = v_month and year = v_year order by id limit 1 for update;$sql$
  );

  v_definition := replace(
    v_definition,
    $sql$select claim_total, tax_rate, tax_amount into v_old_numeric, v_old_numeric_2, v_old_numeric from public.withholding_tax where id = v_match_id;$sql$,
    $sql$select claim_total, tax_rate, tax_amount into v_old_numeric, v_old_numeric_2, v_old_tax_amount from public.withholding_tax where id = v_match_id;$sql$
  );

  v_definition := replace(
    v_definition,
    'if v_tax_amount is distinct from v_old_numeric then v_conflict_fields := v_conflict_fields || jsonb_build_object(''tax_amount'', jsonb_build_object(''from'', v_old_numeric, ''to'', v_tax_amount)); end if;',
    'if v_tax_amount is distinct from v_old_tax_amount then v_conflict_fields := v_conflict_fields || jsonb_build_object(''tax_amount'', jsonb_build_object(''from'', v_old_tax_amount, ''to'', v_tax_amount)); end if;'
  );

  if v_definition = v_original then
    raise exception 'Document ingest WHT hardening did not match the expected function definition';
  end if;

  execute v_definition;
end;
$do$;
