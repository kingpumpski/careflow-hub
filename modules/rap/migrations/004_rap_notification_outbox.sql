-- RAP durable notification outbox (design migration only).
-- Apply after 001, 002, and 003. Keep outside production migration chain until
-- a trusted worker identity, permissions, and delivery provider are reviewed.
-- Payload fields are intentionally minimal; do not put PHI in title/message.

create table if not exists rap.rap_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  facility_id uuid not null references public.facilities(id) on delete restrict,
  recipient_user_id uuid not null,
  category text not null check (category in (
    'RETENTION', 'CLAIM_REJECTION', 'PREAUTH', 'AUDIT_FINDING',
    'IT_REPORT', 'AI_ESCALATION', 'CSA_INCIDENT', 'DPC_BREACH'
  )),
  title text not null check (length(title) between 1 and 160),
  message text not null check (length(message) between 1 and 1000),
  deep_link text,
  idempotency_key text not null check (length(idempotency_key) between 1 and 200),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PROCESSING', 'SENT', 'RETRY', 'DEAD')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 8 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error_code text check (last_error_code is null or length(last_error_code) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, facility_id, idempotency_key, recipient_user_id)
);

create index if not exists idx_rap_notification_outbox_ready
  on rap.rap_notification_outbox(status, available_at, created_at)
  where status in ('PENDING', 'RETRY');

alter table rap.rap_notification_outbox enable row level security;
-- No client policies: authenticated clients cannot enqueue, claim, or inspect
-- the queue directly. Reviewed server adapters must use trusted RPCs.

create or replace function rap.enqueue_notification(
  p_tenant_id uuid,
  p_facility_id uuid,
  p_recipient_user_id uuid,
  p_category text,
  p_title text,
  p_message text,
  p_idempotency_key text,
  p_deep_link text default null
)
returns table(outbox_id uuid, was_inserted boolean)
language plpgsql
security definer
set search_path = pg_catalog, rap
as $$
declare
  new_id uuid;
begin
  if p_tenant_id is null or p_facility_id is null or p_recipient_user_id is null
     or nullif(trim(p_idempotency_key), '') is null then
    raise exception 'RAP notification identity and idempotency key are required';
  end if;

  insert into rap.rap_notification_outbox (
    tenant_id, facility_id, recipient_user_id, category, title, message,
    deep_link, idempotency_key
  ) values (
    p_tenant_id, p_facility_id, p_recipient_user_id, p_category, p_title, p_message,
    p_deep_link, p_idempotency_key
  )
  on conflict (tenant_id, facility_id, idempotency_key, recipient_user_id) do nothing
  returning id into new_id;

  if new_id is not null then
    return query select new_id, true;
    return;
  end if;

  return query
    select n.id, false
      from rap.rap_notification_outbox n
     where n.tenant_id = p_tenant_id
       and n.facility_id = p_facility_id
       and n.idempotency_key = p_idempotency_key
       and n.recipient_user_id = p_recipient_user_id;
end;
$$;

create or replace function rap.claim_notification_batch(p_limit integer default 50)
returns setof rap.rap_notification_outbox
language plpgsql
security definer
set search_path = pg_catalog, rap
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'RAP notification batch limit must be between 1 and 500';
  end if;

  return query
  with candidates as (
    select n.id
      from rap.rap_notification_outbox n
     where n.status in ('PENDING', 'RETRY')
       and n.available_at <= clock_timestamp()
       and n.attempt_count < n.max_attempts
     order by n.available_at, n.created_at, n.id
     for update skip locked
     limit p_limit
  )
  update rap.rap_notification_outbox n
     set status = 'PROCESSING',
         attempt_count = n.attempt_count + 1,
         locked_at = clock_timestamp(),
         updated_at = clock_timestamp()
    from candidates c
   where n.id = c.id
  returning n.*;
end;
$$;

-- Worker-only operations: no client role can call these functions by default.
revoke all on function rap.enqueue_notification(uuid, uuid, uuid, text, text, text, text, text) from public;
revoke all on function rap.claim_notification_batch(integer) from public;

comment on table rap.rap_notification_outbox is
  'Durable idempotent RAP notification queue; stores minimal notification content, not PHI.';
comment on function rap.claim_notification_batch(integer) is
  'Atomically claims ready notifications with SKIP LOCKED. Worker must mark success or schedule bounded retry/dead-letter.';
