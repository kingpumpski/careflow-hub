create or replace function public.ingest_document_records(
  p_source_filename text,
  p_source_hash text,
  p_records jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_batch_id uuid;
  v_record jsonb;
  v_entity text;
  v_data jsonb;
  v_fingerprint text;
  v_identity text;
  v_match_id uuid;
  v_received integer := 0;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_duplicates integer := 0;
  v_conflicts integer := 0;
  v_invalid integer := 0;
  v_changed_fields jsonb;
  v_conflict_fields jsonb;
  v_company_id uuid;
  v_company_name text;
  v_claim_amount numeric;
  v_claim_month integer;
  v_claim_year integer;
  v_status text;
  v_pre_auth_id uuid;
  v_patient_name text;
  v_procedure_name text;
  v_submission_date date;
  v_payment_date date;
  v_amount_paid numeric;
  v_reference_number text;
  v_claim_id uuid;
  v_tax_amount numeric;
  v_month integer;
  v_year integer;
  v_claim_total numeric;
  v_tax_rate numeric;
  v_old_text text;
  v_old_text_2 text;
  v_old_numeric numeric;
  v_old_numeric_2 numeric;
  v_old_uuid uuid;
  v_old_date date;
  v_old_array text[];
  v_new_array text[];
  v_old_bool boolean;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if jsonb_typeof(coalesce(p_records, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'Records must be a JSON array';
  end if;

  insert into public.document_ingest_batches (source_filename, source_hash, uploaded_by)
  values (left(coalesce(p_source_filename, 'uploaded-document'), 500), left(p_source_hash, 128), v_user_id)
  returning id into v_batch_id;

  for v_record in select value from jsonb_array_elements(p_records)
  loop
    v_received := v_received + 1;
    v_entity := v_record->>'entity';
    v_data := coalesce(v_record->'data', '{}'::jsonb);
    v_match_id := null;
    v_changed_fields := '{}'::jsonb;
    v_conflict_fields := '{}'::jsonb;

    if v_entity = 'insurance_company' then
      if not security_internal.current_user_has_permission('masterdata.write') then
        raise exception using errcode = '42501', message = 'Insufficient permission for insurance company import';
      end if;
      v_company_name := lower(regexp_replace(trim(coalesce(v_data->>'company_name', '')), '\\s+', ' ', 'g'));
      if v_company_name = '' then
        v_invalid := v_invalid + 1;
        insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status)
        values (v_batch_id, coalesce(v_entity, 'unknown'), md5(v_record::text), v_record, 'invalid');
        continue;
      end if;

      v_fingerprint := md5('insurance_company|' || v_company_name || '|' || coalesce(v_data->>'is_active', 'true'));
      select id, contact_person, email, phone, address, additional_emails, color, is_active
      into v_match_id, v_old_text, v_old_text_2, v_old_text, v_old_text_2, v_old_array, v_old_text, v_old_bool
      from public.insurance_companies
      where lower(regexp_replace(trim(company_name), '\\s+', ' ', 'g')) = v_company_name
      order by id limit 1 for update;

      if v_match_id is null then
        insert into public.insurance_companies (company_name, is_active, contact_person, email, phone, address, additional_emails, color)
        values (
          trim(v_data->>'company_name'),
          coalesce((v_data->>'is_active')::boolean, true),
          nullif(trim(v_data->>'contact_person'), ''),
          nullif(trim(v_data->>'email'), ''),
          nullif(trim(v_data->>'phone'), ''),
          nullif(trim(v_data->>'address'), ''),
          case when jsonb_typeof(v_data->'additional_emails') = 'array' then array(select jsonb_array_elements_text(v_data->'additional_emails')) else null end,
          nullif(trim(v_data->>'color'), '')
        )
        returning id into v_match_id;
        v_inserted := v_inserted + 1;
        insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status, matched_record_id)
        values (v_batch_id, v_entity, v_fingerprint, v_record, 'inserted', v_match_id);
      else
        select contact_person, email, phone, address, additional_emails, color, is_active
        into v_old_text, v_old_text_2, v_old_text, v_old_text_2, v_old_array, v_old_text, v_old_bool
        from public.insurance_companies where id = v_match_id for update;

        if nullif(trim(v_data->>'contact_person'), '') is not null then
          if v_old_text is null then v_changed_fields := v_changed_fields || jsonb_build_object('contact_person', jsonb_build_object('from', null, 'to', trim(v_data->>'contact_person')));
          elsif lower(v_old_text) <> lower(trim(v_data->>'contact_person')) then v_conflict_fields := v_conflict_fields || jsonb_build_object('contact_person', jsonb_build_object('from', v_old_text, 'to', trim(v_data->>'contact_person'))); end if;
        end if;
        if nullif(trim(v_data->>'email'), '') is not null then
          if v_old_text_2 is null then v_changed_fields := v_changed_fields || jsonb_build_object('email', jsonb_build_object('from', null, 'to', trim(v_data->>'email')));
          elsif lower(v_old_text_2) <> lower(trim(v_data->>'email')) then v_conflict_fields := v_conflict_fields || jsonb_build_object('email', jsonb_build_object('from', v_old_text_2, 'to', trim(v_data->>'email'))); end if;
        end if;
        select phone, address, color into v_old_text, v_old_text_2, v_old_text from public.insurance_companies where id = v_match_id;
        if nullif(trim(v_data->>'phone'), '') is not null then
          if v_old_text is null then v_changed_fields := v_changed_fields || jsonb_build_object('phone', jsonb_build_object('from', null, 'to', trim(v_data->>'phone')));
          elsif trim(v_old_text) <> trim(v_data->>'phone') then v_conflict_fields := v_conflict_fields || jsonb_build_object('phone', jsonb_build_object('from', v_old_text, 'to', trim(v_data->>'phone'))); end if;
        end if;
        if nullif(trim(v_data->>'address'), '') is not null then
          if v_old_text_2 is null then v_changed_fields := v_changed_fields || jsonb_build_object('address', jsonb_build_object('from', null, 'to', trim(v_data->>'address')));
          elsif trim(v_old_text_2) <> trim(v_data->>'address') then v_conflict_fields := v_conflict_fields || jsonb_build_object('address', jsonb_build_object('from', v_old_text_2, 'to', trim(v_data->>'address'))); end if;
        end if;
        select color into v_old_text from public.insurance_companies where id = v_match_id;
        if nullif(trim(v_data->>'color'), '') is not null then
          if v_old_text is null then v_changed_fields := v_changed_fields || jsonb_build_object('color', jsonb_build_object('from', null, 'to', trim(v_data->>'color')));
          elsif trim(v_old_text) <> trim(v_data->>'color') then v_conflict_fields := v_conflict_fields || jsonb_build_object('color', jsonb_build_object('from', v_old_text, 'to', trim(v_data->>'color'))); end if;
        end if;
        if jsonb_typeof(v_data->'additional_emails') = 'array' then
          v_new_array := array(select jsonb_array_elements_text(v_data->'additional_emails'));
          if v_old_array is null then v_changed_fields := v_changed_fields || jsonb_build_object('additional_emails', jsonb_build_object('from', null, 'to', v_new_array));
          elsif v_old_array <> v_new_array then v_conflict_fields := v_conflict_fields || jsonb_build_object('additional_emails', jsonb_build_object('from', v_old_array, 'to', v_new_array)); end if;
        end if;
        if v_data ? 'is_active' and v_old_bool is distinct from (v_data->>'is_active')::boolean then
          v_conflict_fields := v_conflict_fields || jsonb_build_object('is_active', jsonb_build_object('from', v_old_bool, 'to', (v_data->>'is_active')::boolean));
        end if;

        if v_conflict_fields <> '{}'::jsonb then
          v_conflicts := v_conflicts + 1;
          insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status, matched_record_id, changed_fields, conflict_fields)
          values (v_batch_id, v_entity, v_fingerprint, v_record, 'conflict', v_match_id, v_changed_fields, v_conflict_fields);
        elsif v_changed_fields <> '{}'::jsonb then
          update public.insurance_companies
          set contact_person = coalesce(contact_person, nullif(trim(v_data->>'contact_person'), '')),
              email = coalesce(email, nullif(trim(v_data->>'email'), '')),
              phone = coalesce(phone, nullif(trim(v_data->>'phone'), '')),
              address = coalesce(address, nullif(trim(v_data->>'address'), '')),
              color = coalesce(color, nullif(trim(v_data->>'color'), '')),
              additional_emails = coalesce(additional_emails, case when jsonb_typeof(v_data->'additional_emails') = 'array' then array(select jsonb_array_elements_text(v_data->'additional_emails')) else null end)
          where id = v_match_id;
          v_updated := v_updated + 1;
          insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status, matched_record_id, changed_fields)
          values (v_batch_id, v_entity, v_fingerprint, v_record, 'updated', v_match_id, v_changed_fields);
        else
          v_duplicates := v_duplicates + 1;
          insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status, matched_record_id)
          values (v_batch_id, v_entity, v_fingerprint, v_record, 'duplicate', v_match_id);
        end if;
      end if;

    elsif v_entity = 'claim' then
      if not security_internal.current_user_has_permission('claims.write') then
        raise exception using errcode = '42501', message = 'Insufficient permission for claim import';
      end if;
      v_company_id := nullif(v_data->>'insurance_company_id', '')::uuid;
      v_claim_amount := nullif(v_data->>'claim_amount', '')::numeric;
      v_claim_month := nullif(v_data->>'claim_month', '')::integer;
      v_claim_year := nullif(v_data->>'claim_year', '')::integer;
      v_status := coalesce(nullif(trim(v_data->>'status'), ''), 'submitted');
      v_pre_auth_id := nullif(v_data->>'preauth_id', '')::uuid;
      v_patient_name := nullif(trim(v_data->>'patient_name'), '');
      v_procedure_name := nullif(trim(v_data->>'procedure_name'), '');
      v_submission_date := nullif(v_data->>'submission_date', '')::date;
      if v_company_id is null or v_claim_amount is null or v_claim_month is null or v_claim_year is null then
        v_invalid := v_invalid + 1;
        insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status) values (v_batch_id, v_entity, md5(v_record::text), v_record, 'invalid');
        continue;
      end if;

      if v_pre_auth_id is not null then
        v_identity := concat_ws('|', 'claim', v_company_id::text, 'preauth', v_pre_auth_id::text);
        select id, claim_amount, status, patient_name, procedure_name, submission_date into v_match_id, v_old_numeric, v_old_text, v_old_text_2, v_old_text_2, v_old_date
        from public.claims where insurance_company_id = v_company_id and preauth_id = v_pre_auth_id order by id limit 1 for update;
      elsif v_patient_name is not null and v_procedure_name is not null and v_submission_date is not null then
        v_identity := concat_ws('|', 'claim', v_company_id::text, v_claim_month::text, v_claim_year::text, lower(v_patient_name), lower(v_procedure_name), v_submission_date::text);
        select id, claim_amount, status, patient_name, procedure_name, submission_date into v_match_id, v_old_numeric, v_old_text, v_old_text_2, v_old_text_2, v_old_date
        from public.claims where insurance_company_id = v_company_id and claim_month = v_claim_month and claim_year = v_claim_year and lower(coalesce(patient_name,'')) = lower(v_patient_name) and lower(coalesce(procedure_name,'')) = lower(v_procedure_name) and submission_date = v_submission_date order by id limit 1 for update;
      else
        v_identity := concat_ws('|', 'claim', v_company_id::text, v_claim_month::text, v_claim_year::text, v_claim_amount::text);
        select id, claim_amount, status into v_match_id, v_old_numeric, v_old_text
        from public.claims where insurance_company_id = v_company_id and claim_month = v_claim_month and claim_year = v_claim_year and claim_amount = v_claim_amount order by id limit 1 for update;
      end if;
      v_fingerprint := md5(v_identity || '|' || lower(v_status));

      if v_match_id is null then
        insert into public.claims (insurance_company_id, claim_amount, claim_month, claim_year, status, preauth_id, patient_name, procedure_name, submission_date)
        values (v_company_id, v_claim_amount, v_claim_month, v_claim_year, v_status, v_pre_auth_id, v_patient_name, v_procedure_name, coalesce(v_submission_date, current_date))
        returning id into v_match_id;
        v_inserted := v_inserted + 1;
        insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status, matched_record_id) values (v_batch_id, v_entity, v_fingerprint, v_record, 'inserted', v_match_id);
      else
        select claim_amount, status, patient_name, procedure_name, preauth_id into v_old_numeric, v_old_text, v_old_text_2, v_old_text_2, v_old_uuid from public.claims where id = v_match_id;
        if v_old_numeric is distinct from v_claim_amount then v_conflict_fields := v_conflict_fields || jsonb_build_object('claim_amount', jsonb_build_object('from', v_old_numeric, 'to', v_claim_amount)); end if;
        if lower(coalesce(v_old_text,'')) <> lower(v_status) then v_conflict_fields := v_conflict_fields || jsonb_build_object('status', jsonb_build_object('from', v_old_text, 'to', v_status)); end if;
        select patient_name, procedure_name, preauth_id into v_old_text, v_old_text_2, v_old_uuid from public.claims where id = v_match_id;
        if v_patient_name is not null then
          if v_old_text is null then v_changed_fields := v_changed_fields || jsonb_build_object('patient_name', jsonb_build_object('from', null, 'to', v_patient_name));
          elsif lower(v_old_text) <> lower(v_patient_name) then v_conflict_fields := v_conflict_fields || jsonb_build_object('patient_name', jsonb_build_object('from', v_old_text, 'to', v_patient_name)); end if;
        end if;
        if v_procedure_name is not null then
          if v_old_text_2 is null then v_changed_fields := v_changed_fields || jsonb_build_object('procedure_name', jsonb_build_object('from', null, 'to', v_procedure_name));
          elsif lower(v_old_text_2) <> lower(v_procedure_name) then v_conflict_fields := v_conflict_fields || jsonb_build_object('procedure_name', jsonb_build_object('from', v_old_text_2, 'to', v_procedure_name)); end if;
        end if;
        if v_pre_auth_id is not null and v_old_uuid is null then v_changed_fields := v_changed_fields || jsonb_build_object('preauth_id', jsonb_build_object('from', null, 'to', v_pre_auth_id));
        elsif v_pre_auth_id is not null and v_old_uuid is distinct from v_pre_auth_id then v_conflict_fields := v_conflict_fields || jsonb_build_object('preauth_id', jsonb_build_object('from', v_old_uuid, 'to', v_pre_auth_id)); end if;

        if v_conflict_fields <> '{}'::jsonb then
          v_conflicts := v_conflicts + 1;
          insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status, matched_record_id, changed_fields, conflict_fields) values (v_batch_id, v_entity, v_fingerprint, v_record, 'conflict', v_match_id, v_changed_fields, v_conflict_fields);
        elsif v_changed_fields <> '{}'::jsonb then
          update public.claims set patient_name = coalesce(patient_name, v_patient_name), procedure_name = coalesce(procedure_name, v_procedure_name), preauth_id = coalesce(preauth_id, v_pre_auth_id) where id = v_match_id;
          v_updated := v_updated + 1;
          insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status, matched_record_id, changed_fields) values (v_batch_id, v_entity, v_fingerprint, v_record, 'updated', v_match_id, v_changed_fields);
        else
          v_duplicates := v_duplicates + 1;
          insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status, matched_record_id) values (v_batch_id, v_entity, v_fingerprint, v_record, 'duplicate', v_match_id);
        end if;
      end if;

    elsif v_entity = 'payment' then
      if not security_internal.current_user_has_permission('payments.write') then
        raise exception using errcode = '42501', message = 'Insufficient permission for payment import';
      end if;
      v_company_id := nullif(v_data->>'insurance_company_id', '')::uuid;
      v_amount_paid := nullif(v_data->>'amount_paid', '')::numeric;
      v_payment_date := nullif(v_data->>'payment_date', '')::date;
      v_reference_number := nullif(trim(v_data->>'reference_number'), '');
      v_claim_id := nullif(v_data->>'claim_id', '')::uuid;
      if v_company_id is null or v_amount_paid is null or v_payment_date is null then
        v_invalid := v_invalid + 1;
        insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status) values (v_batch_id, v_entity, md5(v_record::text), v_record, 'invalid');
        continue;
      end if;
      if v_reference_number is not null then
        v_identity := concat_ws('|', 'payment', v_company_id::text, 'reference', lower(v_reference_number));
        select id, amount_paid, payment_date, claim_id, reference_number into v_match_id, v_old_numeric, v_old_date, v_old_uuid, v_old_text from public.payments where insurance_company_id = v_company_id and lower(reference_number) = lower(v_reference_number) order by id limit 1 for update;
      elsif v_claim_id is not null then
        v_identity := concat_ws('|', 'payment', v_company_id::text, 'claim', v_claim_id::text, v_payment_date::text);
        select id, amount_paid, payment_date, claim_id, reference_number into v_match_id, v_old_numeric, v_old_date, v_old_uuid, v_old_text from public.payments where insurance_company_id = v_company_id and claim_id = v_claim_id and payment_date = v_payment_date order by id limit 1 for update;
      else
        v_identity := concat_ws('|', 'payment', v_company_id::text, v_payment_date::text, v_amount_paid::text);
        select id, amount_paid, payment_date, claim_id, reference_number into v_match_id, v_old_numeric, v_old_date, v_old_uuid, v_old_text from public.payments where insurance_company_id = v_company_id and payment_date = v_payment_date and amount_paid = v_amount_paid order by id limit 1 for update;
      end if;
      v_fingerprint := md5(v_identity);
      if v_match_id is null then
        insert into public.payments (insurance_company_id, amount_paid, payment_date, reference_number, claim_id, payment_method, claim_month, claim_year)
        values (v_company_id, v_amount_paid, v_payment_date, v_reference_number, v_claim_id, nullif(trim(v_data->>'payment_method'), ''), nullif(v_data->>'claim_month','')::integer, nullif(v_data->>'claim_year','')::integer)
        returning id into v_match_id;
        v_inserted := v_inserted + 1;
        insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status, matched_record_id) values (v_batch_id, v_entity, v_fingerprint, v_record, 'inserted', v_match_id);
      else
        if v_old_numeric is distinct from v_amount_paid then v_conflict_fields := v_conflict_fields || jsonb_build_object('amount_paid', jsonb_build_object('from', v_old_numeric, 'to', v_amount_paid)); end if;
        if v_old_date is distinct from v_payment_date then v_conflict_fields := v_conflict_fields || jsonb_build_object('payment_date', jsonb_build_object('from', v_old_date, 'to', v_payment_date)); end if;
        if v_reference_number is not null and v_old_text is null then v_changed_fields := v_changed_fields || jsonb_build_object('reference_number', jsonb_build_object('from', null, 'to', v_reference_number)); elsif v_reference_number is not null and lower(coalesce(v_old_text,'')) <> lower(v_reference_number) then v_conflict_fields := v_conflict_fields || jsonb_build_object('reference_number', jsonb_build_object('from', v_old_text, 'to', v_reference_number)); end if;
        if v_claim_id is not null and v_old_uuid is null then v_changed_fields := v_changed_fields || jsonb_build_object('claim_id', jsonb_build_object('from', null, 'to', v_claim_id)); elsif v_claim_id is not null and v_old_uuid is distinct from v_claim_id then v_conflict_fields := v_conflict_fields || jsonb_build_object('claim_id', jsonb_build_object('from', v_old_uuid, 'to', v_claim_id)); end if;
        if v_conflict_fields <> '{}'::jsonb then
          v_conflicts := v_conflicts + 1;
          insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status, matched_record_id, changed_fields, conflict_fields) values (v_batch_id, v_entity, v_fingerprint, v_record, 'conflict', v_match_id, v_changed_fields, v_conflict_fields);
        elsif v_changed_fields <> '{}'::jsonb then
          update public.payments set reference_number = coalesce(reference_number, v_reference_number), claim_id = coalesce(claim_id, v_claim_id), payment_method = coalesce(payment_method, nullif(trim(v_data->>'payment_method'), '')), claim_month = coalesce(claim_month, nullif(v_data->>'claim_month','')::integer), claim_year = coalesce(claim_year, nullif(v_data->>'claim_year','')::integer) where id = v_match_id;
          v_updated := v_updated + 1;
          insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status, matched_record_id, changed_fields) values (v_batch_id, v_entity, v_fingerprint, v_record, 'updated', v_match_id, v_changed_fields);
        else
          v_duplicates := v_duplicates + 1;
          insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status, matched_record_id) values (v_batch_id, v_entity, v_fingerprint, v_record, 'duplicate', v_match_id);
        end if;
      end if;

    elsif v_entity = 'withholding_tax' then
      if not security_internal.current_user_has_permission('payments.write') then
        raise exception using errcode = '42501', message = 'Insufficient permission for withholding tax import';
      end if;
      v_company_id := nullif(v_data->>'insurance_company_id', '')::uuid;
      v_month := nullif(v_data->>'month', '')::integer;
      v_year := nullif(v_data->>'year', '')::integer;
      v_claim_total := nullif(v_data->>'claim_total', '')::numeric;
      v_tax_rate := nullif(v_data->>'tax_rate', '')::numeric;
      v_tax_amount := nullif(v_data->>'tax_amount', '')::numeric;
      if v_company_id is null or v_month is null or v_year is null or v_tax_amount is null then
        v_invalid := v_invalid + 1;
        insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status) values (v_batch_id, v_entity, md5(v_record::text), v_record, 'invalid');
        continue;
      end if;
      v_identity := concat_ws('|', 'withholding_tax', v_company_id::text, v_month::text, v_year::text);
      v_fingerprint := md5(v_identity || '|' || v_tax_amount::text);
      select id, claim_total, tax_rate, tax_amount into v_match_id, v_old_numeric, v_old_numeric_2, v_old_numeric from public.withholding_tax where insurance_company_id = v_company_id and month = v_month and year = v_year order by id limit 1 for update;
      if v_match_id is null then
        insert into public.withholding_tax (insurance_company_id, month, year, claim_total, tax_rate, tax_amount) values (v_company_id, v_month, v_year, v_claim_total, v_tax_rate, v_tax_amount) returning id into v_match_id;
        v_inserted := v_inserted + 1;
        insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status, matched_record_id) values (v_batch_id, v_entity, v_fingerprint, v_record, 'inserted', v_match_id);
      else
        if v_old_numeric is distinct from v_tax_amount then v_conflict_fields := v_conflict_fields || jsonb_build_object('tax_amount', jsonb_build_object('from', v_old_numeric, 'to', v_tax_amount)); end if;
        if v_claim_total is not null and v_old_numeric is null then v_changed_fields := v_changed_fields || jsonb_build_object('claim_total', jsonb_build_object('from', null, 'to', v_claim_total)); elsif v_claim_total is not null and v_old_numeric is distinct from v_claim_total then v_conflict_fields := v_conflict_fields || jsonb_build_object('claim_total', jsonb_build_object('from', v_old_numeric, 'to', v_claim_total)); end if;
        if v_tax_rate is not null and v_old_numeric_2 is null then v_changed_fields := v_changed_fields || jsonb_build_object('tax_rate', jsonb_build_object('from', null, 'to', v_tax_rate)); elsif v_tax_rate is not null and v_old_numeric_2 is distinct from v_tax_rate then v_conflict_fields := v_conflict_fields || jsonb_build_object('tax_rate', jsonb_build_object('from', v_old_numeric_2, 'to', v_tax_rate)); end if;
        if v_conflict_fields <> '{}'::jsonb then
          v_conflicts := v_conflicts + 1;
          insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status, matched_record_id, changed_fields, conflict_fields) values (v_batch_id, v_entity, v_fingerprint, v_record, 'conflict', v_match_id, v_changed_fields, v_conflict_fields);
        elsif v_changed_fields <> '{}'::jsonb then
          update public.withholding_tax set claim_total = coalesce(claim_total, v_claim_total), tax_rate = coalesce(tax_rate, v_tax_rate) where id = v_match_id;
          v_updated := v_updated + 1;
          insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status, matched_record_id, changed_fields) values (v_batch_id, v_entity, v_fingerprint, v_record, 'updated', v_match_id, v_changed_fields);
        else
          v_duplicates := v_duplicates + 1;
          insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status, matched_record_id) values (v_batch_id, v_entity, v_fingerprint, v_record, 'duplicate', v_match_id);
        end if;
      end if;
    else
      v_invalid := v_invalid + 1;
      insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status) values (v_batch_id, coalesce(v_entity, 'unknown'), md5(v_record::text), v_record, 'invalid');
    end if;
  end loop;

  update public.document_ingest_batches
  set received_count = v_received, inserted_count = v_inserted, updated_count = v_updated, duplicate_count = v_duplicates, conflict_count = v_conflicts, invalid_count = v_invalid
  where id = v_batch_id;

  return jsonb_build_object('batch_id', v_batch_id, 'received', v_received, 'inserted', v_inserted, 'updated', v_updated, 'duplicates', v_duplicates, 'conflicts', v_conflicts, 'invalid', v_invalid);
end;
$$;

revoke all on function public.ingest_document_records(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_document_records(text, text, jsonb) to authenticated;
