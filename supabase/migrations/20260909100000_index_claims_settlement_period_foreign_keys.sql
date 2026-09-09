-- Cover the foreign keys on claims_settlement_periods to avoid repeated FK scans.
create index if not exists claims_settlement_periods_facility_fk_idx
  on public.claims_settlement_periods (facility_id);

create index if not exists claims_settlement_periods_insurance_company_fk_idx
  on public.claims_settlement_periods (insurance_company_id);

create index if not exists claims_settlement_periods_created_by_fk_idx
  on public.claims_settlement_periods (created_by);

create index if not exists claims_settlement_periods_confirmed_by_fk_idx
  on public.claims_settlement_periods (confirmed_by);
