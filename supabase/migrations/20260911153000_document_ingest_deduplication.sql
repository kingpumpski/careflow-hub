create extension if not exists pgcrypto;

create table if not exists public.document_ingest_batches (
  id uuid primary key default gen_random_uuid(),
  source_filename text not null,
  source_hash text,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  received_count integer not null default 0,
  inserted_count integer not null default 0,
  duplicate_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.document_ingest_records (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.document_ingest_batches(id) on delete cascade,
  entity text not null,
  record_fingerprint text not null,
  source_record jsonb not null default '{}'::jsonb,
  status text not null check (status in ('inserted', 'duplicate')),
  matched_record_id uuid,
  created_at timestamptz not null default now(),
  unique (batch_id, entity, record_fingerprint)
);

create index if not exists document_ingest_records_fingerprint_idx
  on public.document_ingest_records (entity, record_fingerprint);
create index if not exists document_ingest_records_batch_idx
  on public.document_ingest_records (batch_id);

alter table public.document_ingest_batches enable row level security;
alter table public.document_ingest_records enable row level security;

revoke all on public.document_ingest_batches from anon, authenticated;
revoke all on public.document_ingest_records from anon, authenticated;

grant select on public.document_ingest_batches to authenticated;
grant select on public.document_ingest_records to authenticated;

create or replace function public.ingest_document_records(
  p_source_filename text,
  p_source_hash text,
  p_records jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, security_internal
as $$
declare
  v_user_id uuid := auth.uid();
  v_batch_id uuid;
  v_record jsonb;
  v_entity text;
  v_data jsonb;
  v_fingerprint text;
  v_match_id uuid;
  v_inserted integer := 0;
  v_duplicates integer := 0;
  v_received integer := 0;
  v_allowed boolean;
  v_company_id uuid;
  v_claim_amount numeric;
  v_claim_month integer;
  v_claim_year integer;
  v_status text;
  v_payment_date date;
  v_amount_paid numeric;
  v_tax_amount numeric;
  v_company_name text;
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

    if v_entity = 'insurance_company' then
      v_allowed := security_internal.current_user_has_permission('masterdata.write');
      if not v_allowed then raise exception using errcode = '42501', message = 'Insufficient permission for insurance company import'; end if;
      v_company_name := lower(regexp_replace(trim(coalesce(v_data->>'company_name', '')), '\\s+', ' ', 'g'));
      if v_company_name = '' then continue; end if;
      v_fingerprint := md5('insurance_company|' || v_company_name);
      select id into v_match_id from public.insurance_companies where lower(regexp_replace(trim(company_name), '\\s+', ' ', 'g')) = v_company_name limit 1;
      if v_match_id is not null then
        v_duplicates := v_duplicates + 1;
        insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status, matched_record_id)
        values (v_batch_id, v_entity, v_fingerprint, v_record, 'duplicate', v_match_id);
      else
        insert into public.insurance_companies (company_name, is_active)
        values (trim(v_data->>'company_name'), coalesce((v_data->>'is_active')::boolean, true))
        returning id into v_match_id;
        v_inserted := v_inserted + 1;
        insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status, matched_record_id)
        values (v_batch_id, v_entity, v_fingerprint, v_record, 'inserted', v_match_id);
      end if;

    elsif v_entity = 'claim' then
      v_allowed := security_internal.current_user_has_permission('claims.write');
      if not v_allowed then raise exception using errcode = '42501', message = 'Insufficient permission for claim import'; end if;
      v_company_id := nullif(v_data->>'insurance_company_id', '')::uuid;
      v_claim_amount := nullif(v_data->>'claim_amount', '')::numeric;
      v_claim_month := nullif(v_data->>'claim_month', '')::integer;
      v_claim_year := nullif(v_data->>'claim_year', '')::integer;
      v_status := coalesce(nullif(trim(v_data->>'status'), ''), 'submitted');
      if v_company_id is null or v_claim_amount is null or v_claim_month is null or v_claim_year is null then continue; end if;
      v_fingerprint := md5(concat_ws('|', 'claim', v_company_id::text, v_claim_amount::text, v_claim_month::text, v_claim_year::text, lower(v_status)));
      select id into v_match_id from public.claims
      where insurance_company_id = v_company_id and claim_amount = v_claim_amount and claim_month = v_claim_month and claim_year = v_claim_year and lower(coalesce(status, '')) = lower(v_status)
      limit 1;
      if v_match_id is not null then
        v_duplicates := v_duplicates + 1;
        insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status, matched_record_id)
        values (v_batch_id, v_entity, v_fingerprint, v_record, 'duplicate', v_match_id);
      else
        insert into public.claims (insurance_company_id, claim_amount, claim_month, claim_year, status)
        values (v_company_id, v_claim_amount, v_claim_month, v_claim_year, v_status)
        returning id into v_match_id;
        v_inserted := v_inserted + 1;
        insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status, matched_record_id)
        values (v_batch_id, v_entity, v_fingerprint, v_record, 'inserted', v_match_id);
      end if;

    elsif v_entity = 'payment' then
      v_allowed := security_internal.current_user_has_permission('payments.write');
      if not v_allowed then raise exception using errcode = '42501', message = 'Insufficient permission for payment import'; end if;
      v_company_id := nullif(v_data->>'insurance_company_id', '')::uuid;
      v_amount_paid := nullif(v_data->>'amount_paid', '')::numeric;
      v_payment_date := nullif(v_data->>'payment_date', '')::date;
      if v_company_id is null or v_amount_paid is null or v_payment_date is null then continue; end if;
      v_fingerprint := md5(concat_ws('|', 'payment', v_company_id::text, v_amount_paid::text, v_payment_date::text));
      select id into v_match_id from public.payments
      where insurance_company_id = v_company_id and amount_paid = v_amount_paid and payment_date = v_payment_date
      limit 1;
      if v_match_id is not null then
        v_duplicates := v_duplicates + 1;
        insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status, matched_record_id)
        values (v_batch_id, v_entity, v_fingerprint, v_record, 'duplicate', v_match_id);
      else
        insert into public.payments (insurance_company_id, amount_paid, payment_date)
        values (v_company_id, v_amount_paid, v_payment_date)
        returning id into v_match_id;
        v_inserted := v_inserted + 1;
        insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status, matched_record_id)
        values (v_batch_id, v_entity, v_fingerprint, v_record, 'inserted', v_match_id);
      end if;

    elsif v_entity = 'withholding_tax' then
      v_allowed := security_internal.current_user_has_permission('payments.write');
      if not v_allowed then raise exception using errcode = '42501', message = 'Insufficient permission for withholding tax import'; end if;
      v_company_id := nullif(v_data->>'insurance_company_id', '')::uuid;
      v_tax_amount := nullif(v_data->>'tax_amount', '')::numeric;
      if v_company_id is null or v_tax_amount is null then continue; end if;
      v_fingerprint := md5(concat_ws('|', 'withholding_tax', v_company_id::text, v_tax_amount::text));
      select id into v_match_id from public.withholding_tax
      where insurance_company_id = v_company_id and tax_amount = v_tax_amount
      limit 1;
      if v_match_id is not null then
        v_duplicates := v_duplicates + 1;
        insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status, matched_record_id)
        values (v_batch_id, v_entity, v_fingerprint, v_record, 'duplicate', v_match_id);
      else
        insert into public.withholding_tax (insurance_company_id, tax_amount)
        values (v_company_id, v_tax_amount)
        returning id into v_match_id;
        v_inserted := v_inserted + 1;
        insert into public.document_ingest_records (batch_id, entity, record_fingerprint, source_record, status, matched_record_id)
        values (v_batch_id, v_entity, v_fingerprint, v_record, 'inserted', v_match_id);
      end if;
    end if;
  end loop;

  update public.document_ingest_batches
  set received_count = v_received, inserted_count = v_inserted, duplicate_count = v_duplicates
  where id = v_batch_id;

  return jsonb_build_object('batch_id', v_batch_id, 'received', v_received, 'inserted', v_inserted, 'duplicates', v_duplicates);
end;
$$;

revoke all on function public.ingest_document_records(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_document_records(text, text, jsonb) to authenticated;
