create table if not exists public.settlement_exceptions (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null,
  settlement_period_id uuid not null references public.claims_settlement_periods(id) on delete restrict,
  type text not null check (type in ('overdue_settlement','missing_payment_advice','incomplete_payment_advice','withholding_tax_variance')),
  severity text not null check (severity in ('info','warning','critical')),
  status text not null default 'open' check (status in ('open','under_review','resolved','waived')),
  title text not null,
  reason text not null,
  officer_notes text,
  resolution text,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (settlement_period_id, type)
);

create table if not exists public.settlement_exception_audit_events (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null,
  exception_id uuid not null references public.settlement_exceptions(id) on delete restrict,
  action text not null check (action in ('created','status_changed','note_added','resolved','waived')),
  actor_id uuid not null,
  occurred_at timestamptz not null default now(),
  before_status text,
  after_status text,
  details text not null
);

create index if not exists settlement_exceptions_facility_idx on public.settlement_exceptions(facility_id, status, severity);
create index if not exists settlement_exceptions_period_idx on public.settlement_exceptions(settlement_period_id);
create index if not exists settlement_exception_audit_facility_idx on public.settlement_exception_audit_events(facility_id, occurred_at desc);
create index if not exists settlement_exception_audit_exception_idx on public.settlement_exception_audit_events(exception_id, occurred_at desc);

alter table public.settlement_exceptions enable row level security;
alter table public.settlement_exception_audit_events enable row level security;

drop policy if exists "facility settlement exceptions select" on public.settlement_exceptions;
create policy "facility settlement exceptions select" on public.settlement_exceptions for select to authenticated using (user_has_facility_access(facility_id));
drop policy if exists "facility settlement exceptions insert" on public.settlement_exceptions;
create policy "facility settlement exceptions insert" on public.settlement_exceptions for insert to authenticated with check (user_has_facility_access(facility_id));
drop policy if exists "facility settlement exceptions update" on public.settlement_exceptions;
create policy "facility settlement exceptions update" on public.settlement_exceptions for update to authenticated using (user_has_facility_access(facility_id)) with check (user_has_facility_access(facility_id));
drop policy if exists "facility settlement exceptions audit select" on public.settlement_exception_audit_events;
create policy "facility settlement exceptions audit select" on public.settlement_exception_audit_events for select to authenticated using (user_has_facility_access(facility_id));
drop policy if exists "facility settlement exceptions audit insert" on public.settlement_exception_audit_events;
create policy "facility settlement exceptions audit insert" on public.settlement_exception_audit_events for insert to authenticated with check (user_has_facility_access(facility_id) and actor_id = auth.uid());
revoke all on public.settlement_exceptions from anon;
revoke all on public.settlement_exception_audit_events from anon;
