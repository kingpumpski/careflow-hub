create table if not exists public.settlement_exceptions (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null,
  settlement_period_id uuid not null references public.claims_settlement_periods(id) on delete restrict,
  type text not null check (type in ('payment_variance','rejection_variance','withholding_tax_variance','missing_payment_advice','incomplete_payment_advice','overdue_settlement')),
  severity text not null check (severity in ('info','warning','critical')),
  status text not null default 'open' check (status in ('open','under_review','resolved','waived')),
  title text not null,
  description text not null,
  detected_at timestamptz not null default now(),
  assigned_to uuid null,
  resolution_note text null,
  resolved_at timestamptz null,
  resolved_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_settlement_exceptions_facility_status on public.settlement_exceptions(facility_id, status);
create index if not exists idx_settlement_exceptions_period_type on public.settlement_exceptions(settlement_period_id, type);
create unique index if not exists uq_settlement_exception_active_type on public.settlement_exceptions(settlement_period_id, type) where status in ('open','under_review');

alter table public.settlement_exceptions enable row level security;

drop policy if exists "Settlement exceptions facility access" on public.settlement_exceptions;
create policy "Settlement exceptions facility access"
  on public.settlement_exceptions
  for select using (public.user_has_facility_access(facility_id));

drop policy if exists "Settlement exceptions facility insert" on public.settlement_exceptions;
create policy "Settlement exceptions facility insert"
  on public.settlement_exceptions
  for insert with check (public.user_has_facility_access(facility_id));

drop policy if exists "Settlement exceptions facility update" on public.settlement_exceptions;
create policy "Settlement exceptions facility update"
  on public.settlement_exceptions
  for update using (public.user_has_facility_access(facility_id))
  with check (public.user_has_facility_access(facility_id));

revoke all on public.settlement_exceptions from anon;

create table if not exists public.settlement_exception_audit_events (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null,
  exception_id uuid not null references public.settlement_exceptions(id) on delete restrict,
  event_type text not null check (event_type in ('created','status_changed')),
  actor_id uuid null,
  occurred_at timestamptz not null default now(),
  before_status text null,
  after_status text null,
  note text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_settlement_exception_audit_exception on public.settlement_exception_audit_events(exception_id, occurred_at desc);

alter table public.settlement_exception_audit_events enable row level security;

drop policy if exists "Settlement exception audit facility access" on public.settlement_exception_audit_events;
create policy "Settlement exception audit facility access"
  on public.settlement_exception_audit_events
  for select using (public.user_has_facility_access(facility_id));

drop policy if exists "Settlement exception audit facility insert" on public.settlement_exception_audit_events;
create policy "Settlement exception audit facility insert"
  on public.settlement_exception_audit_events
  for insert with check (public.user_has_facility_access(facility_id));

revoke update, delete on public.settlement_exception_audit_events from authenticated;
revoke all on public.settlement_exception_audit_events from anon;

create or replace function public.prevent_settlement_exception_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Settlement exception audit events are immutable';
end;
$$;

drop trigger if exists trg_settlement_exception_audit_immutable on public.settlement_exception_audit_events;
create trigger trg_settlement_exception_audit_immutable
before update or delete on public.settlement_exception_audit_events
for each row execute function public.prevent_settlement_exception_audit_mutation();
