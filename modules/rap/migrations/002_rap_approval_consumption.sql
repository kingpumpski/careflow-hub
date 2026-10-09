-- RAP approval consumption hardening (design migration only).
-- Intentionally not wired into the production Supabase migration chain.
-- Deploy only after the host's trusted server role and RLS/grants are reviewed.

create table if not exists rap.rap_ai_approval_event (
  id uuid primary key default gen_random_uuid(),
  token_id uuid not null,
  event_type text not null check (event_type in ('CONSUMED', 'REJECTED', 'REVOKED', 'EXPIRED')),
  actor_id uuid,
  action text not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-fA-F]{64}$'),
  reason_code text,
  created_at timestamptz not null default now()
);

create index if not exists idx_rap_approval_event_token
  on rap.rap_ai_approval_event(token_id, created_at);

create or replace function rap.reject_approval_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, rap
as $$
begin
  raise exception 'RAP approval events are append-only';
end;
$$;

drop trigger if exists rap_ai_approval_event_append_only on rap.rap_ai_approval_event;
create trigger rap_ai_approval_event_append_only
before update or delete on rap.rap_ai_approval_event
for each row execute function rap.reject_approval_event_mutation();

-- Approval token state is intentionally mutable only for a single atomic
-- ISSUED -> USED transition. Immutable history lives in rap_ai_approval_event.
drop trigger if exists rap_ai_approval_token_append_only on rap.rap_ai_approval_token;

create or replace function rap.consume_approval_token(
  p_token_id uuid,
  p_actor_id uuid,
  p_action text,
  p_payload_hash text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, rap
as $$
declare
  consumed_id uuid;
  consumed_facility_id uuid;
begin
  if p_token_id is null or p_actor_id is null
     or nullif(trim(p_action), '') is null
     or p_payload_hash is null
     or p_payload_hash !~ '^[0-9a-fA-F]{64}
    return false;
  end if;

  update rap.rap_ai_approval_token token
     set status = 'USED',
         used_at = clock_timestamp()
   where token.id = p_token_id
     and token.requested_by = p_actor_id
     and token.action = p_action
     and lower(token.payload_hash) = lower(p_payload_hash)
     and token.status = 'ISSUED'
     and token.used_at is null
     and token.expires_at > clock_timestamp()
   returning token.id, token.facility_id into consumed_id, consumed_facility_id;

  if consumed_id is null then
    return false;
  end if;

  insert into rap.rap_ai_approval_event (
    token_id, event_type, actor_id, action, payload_hash, facility_id
  ) values (
    consumed_id, 'CONSUMED', p_actor_id, p_action, lower(p_payload_hash), consumed_facility_id
  );

  return true;
end;
$$;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default; explicitly
-- remove that default. A deployment-specific trusted server role must be granted
-- EXECUTE only after its identity and RLS posture have been reviewed.
revoke all on function rap.consume_approval_token(uuid, uuid, text, text) from public;

comment on function rap.consume_approval_token(uuid, uuid, text, text) is
  'Atomic single-use approval consumption. Call only from a trusted server adapter after HMAC verification; do not grant EXECUTE to anon/authenticated clients.';
comment on table rap.rap_ai_approval_event is
  'Append-only immutable audit events for RAP approval token lifecycle.';
 then
    return false;
  end if;

  update rap.rap_ai_approval_token token
     set status = 'USED',
         used_at = clock_timestamp()
   where token.id = p_token_id
     and token.requested_by = p_actor_id
     and token.action = p_action
     and lower(token.payload_hash) = lower(p_payload_hash)
     and token.status = 'ISSUED'
     and token.used_at is null
     and token.expires_at > clock_timestamp()
   returning token.id into consumed_id;

  if consumed_id is null then
    return false;
  end if;

  insert into rap.rap_ai_approval_event (
    token_id, event_type, actor_id, action, payload_hash
  ) values (
    consumed_id, 'CONSUMED', p_actor_id, p_action, lower(p_payload_hash)
  );

  return true;
end;
$$;

comment on function rap.consume_approval_token(uuid, uuid, text, text) is
  'Atomic single-use approval consumption. Call only from a trusted server adapter after HMAC verification; do not grant EXECUTE to anon/authenticated clients.';
comment on table rap.rap_ai_approval_event is
  'Append-only immutable audit events for RAP approval token lifecycle.';
