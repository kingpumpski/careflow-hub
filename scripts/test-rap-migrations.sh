#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=postgres}"
: "${PGPASSWORD:=rap-test-password}"
export PGHOST PGPORT PGUSER PGDATABASE PGPASSWORD

psql -v ON_ERROR_STOP=1 <<'SQL'
create role authenticated nologin;
create schema auth;
create or replace function auth.uid() returns uuid
language sql stable as $$ select null::uuid $$;
create table public.facilities (id uuid primary key);
insert into public.facilities(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
create or replace function public.user_has_facility_access(p_facility_id uuid)
returns boolean language sql stable as $$ select p_facility_id is not null $$;
SQL

psql -v ON_ERROR_STOP=1 -f modules/rap/migrations/001_rap_schema.sql
psql -v ON_ERROR_STOP=1 -f modules/rap/migrations/002_rap_approval_consumption.sql
psql -v ON_ERROR_STOP=1 -f modules/rap/migrations/003_rap_facility_rls.sql
psql -v ON_ERROR_STOP=1 -f modules/rap/migrations/004_rap_notification_outbox.sql

psql -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare
  first_id uuid;
  duplicate_id uuid;
  inserted boolean;
  delivery_status text;
  approval_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  actor_id uuid := '11111111-1111-4111-8111-111111111111';
  payload_hash text := repeat('a', 64);
begin
  select outbox_id, was_inserted into first_id, inserted
    from rap.enqueue_notification(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      actor_id, 'RETENTION', 'Retention notice', 'A record is approaching retention expiry.',
      'rap-test-idempotency-key', '/rap/retention'
    );
  if not inserted then raise exception 'first notification enqueue was not inserted'; end if;

  select outbox_id, was_inserted into duplicate_id, inserted
    from rap.enqueue_notification(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      actor_id, 'RETENTION', 'Retention notice', 'A record is approaching retention expiry.',
      'rap-test-idempotency-key', '/rap/retention'
    );
  if inserted or duplicate_id <> first_id then raise exception 'notification enqueue is not idempotent'; end if;

  if (select count(*) from rap.claim_notification_batch(10)) <> 1 then
    raise exception 'notification claim did not return exactly one ready row';
  end if;
  delivery_status := rap.complete_notification_delivery(first_id, true, null, 60);
  if delivery_status <> 'SENT' then raise exception 'notification did not transition to SENT'; end if;

  insert into rap.rap_ai_approval_token(
    id, action, payload_hash, requested_by, approved_by, approved_at, expires_at, status, facility_id
  ) values (
    approval_id, 'export', payload_hash, actor_id, actor_id,
    clock_timestamp(), clock_timestamp() + interval '5 minutes', 'ISSUED',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  if not rap.consume_approval_token(approval_id, actor_id, 'export', payload_hash) then
    raise exception 'valid approval token was not consumed';
  end if;
  if rap.consume_approval_token(approval_id, actor_id, 'export', payload_hash) then
    raise exception 'approval token replay was accepted';
  end if;
  if (select count(*) from rap.rap_ai_approval_event where token_id = approval_id and event_type = 'CONSUMED') <> 1 then
    raise exception 'approval consumption event missing or duplicated';
  end if;
end $$;
SQL

echo "RAP PostgreSQL migrations and smoke assertions passed."
