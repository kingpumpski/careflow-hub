#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=postgres}"
: "${PGPASSWORD:=rap-test-password}"
export PGHOST PGPORT PGUSER PGDATABASE PGPASSWORD

psql -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
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
  fn text;
  role_name text;
begin
  foreach fn in array array[
    'rap.consume_approval_token(uuid,uuid,text,text)',
    'rap.enqueue_notification(uuid,uuid,uuid,text,text,text,text,text)',
    'rap.claim_notification_batch(integer)',
    'rap.complete_notification_delivery(uuid,boolean,text,integer)'
  ] loop
    foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
      if has_function_privilege(role_name, fn, 'EXECUTE') then
        raise exception 'untrusted role % can execute privileged RAP function %', role_name, fn;
      end if;
    end loop;
  end loop;
end $$;
SQL

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

  -- A repeated key may be acknowledged only when the payload is identical.
  begin
    perform rap.enqueue_notification(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      actor_id, 'RETENTION', 'Retention notice', 'Different message under same key',
      'rap-test-idempotency-key', '/rap/retention'
    );
    raise exception 'conflicting notification idempotency key was accepted';
  exception when others then
    if sqlerrm not like '%idempotency key reused with different content%' then
      raise;
    end if;
  end;

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

  -- A failed final delivery attempt must dead-letter rather than loop forever.
  select outbox_id into first_id
    from rap.enqueue_notification(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      actor_id, 'RETENTION', 'Retry test', 'Retry test message',
      'rap-test-dead-letter-key', null
    );
  update rap.rap_notification_outbox set max_attempts = 1 where id = first_id;
  if (select count(*) from rap.claim_notification_batch(10)) <> 1 then
    raise exception 'dead-letter test notification was not claimed';
  end if;
  delivery_status := rap.complete_notification_delivery(first_id, false, 'PROVIDER_DOWN', 1);
  if delivery_status <> 'DEAD' then raise exception 'final failed delivery was not dead-lettered'; end if;

  -- An expired worker lease is reclaimable, with attempts bounded by max_attempts.
  select outbox_id into first_id
    from rap.enqueue_notification(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      actor_id, 'RETENTION', 'Lease test', 'Lease test message',
      'rap-test-worker-lease-key', null
    );
  if (select count(*) from rap.claim_notification_batch(10)) <> 1 then
    raise exception 'lease test notification was not claimed';
  end if;
  update rap.rap_notification_outbox
     set locked_at = clock_timestamp() - interval '10 minutes'
   where id = first_id;
  if (select count(*) from rap.claim_notification_batch(10)) <> 1 then
    raise exception 'expired worker lease was not reclaimed';
  end if;
  if (select attempt_count from rap.rap_notification_outbox where id = first_id) <> 2 then
    raise exception 'worker lease recovery did not increment attempt count';
  end if;
  perform rap.complete_notification_delivery(first_id, true, null, 1);
end $$;
SQL


# Race two independent PostgreSQL sessions against the same single-use token.
# Exactly one must transition ISSUED -> USED; the other must observe replay.
psql -v ON_ERROR_STOP=1 <<'SQL'
insert into rap.rap_ai_approval_token(
  id, action, payload_hash, requested_by, approved_by, approved_at, expires_at, status, facility_id
) values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'concurrent_export', repeat('b', 64),
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  clock_timestamp(), clock_timestamp() + interval '5 minutes', 'ISSUED',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);
SQL

race_dir="$(mktemp -d)"
trap 'rm -rf "$race_dir"' EXIT
(
  psql -At -v ON_ERROR_STOP=1 -c "select rap.consume_approval_token('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111', 'concurrent_export', repeat('b', 64));" >"$race_dir/first"
) &
first_pid=$!
(
  psql -At -v ON_ERROR_STOP=1 -c "select rap.consume_approval_token('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111', 'concurrent_export', repeat('b', 64));" >"$race_dir/second"
) &
second_pid=$!
wait "$first_pid"
wait "$second_pid"
successful_consumptions="$(cat "$race_dir/first" "$race_dir/second" | grep -xc 't' || true)"
if [[ "$successful_consumptions" != "1" ]]; then
  echo "Expected exactly one successful concurrent approval consumption; got $successful_consumptions." >&2
  cat "$race_dir/first" "$race_dir/second" >&2
  exit 1
fi

echo "RAP PostgreSQL migrations, smoke assertions, and concurrent approval replay test passed."
