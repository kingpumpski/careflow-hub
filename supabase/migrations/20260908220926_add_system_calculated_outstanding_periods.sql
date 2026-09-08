create or replace view public.claims_outstanding_periods
with (security_invoker = true)
as
with claim_periods as (
  select c.insurance_company_id, c.claim_year as period_year, c.claim_month as period_month,
    sum(coalesce(c.claim_amount, 0)) as submitted_amount,
    sum(case when lower(coalesce(c.status, '')) = 'rejected' then coalesce(c.claim_amount, 0) else 0 end) as rejected_amount
  from public.claims c
  where c.claim_year is not null and c.claim_month between 1 and 12
  group by c.insurance_company_id, c.claim_year, c.claim_month
), payment_periods as (
  select coalesce(c.insurance_company_id, p.insurance_company_id) as insurance_company_id,
    coalesce(c.claim_year, p.claim_year) as period_year, coalesce(c.claim_month, p.claim_month) as period_month,
    sum(coalesce(p.amount_paid, 0)) as paid_amount, count(*) as payment_entry_count
  from public.payments p left join public.claims c on c.id = p.claim_id
  where coalesce(c.claim_year, p.claim_year) is not null and coalesce(c.claim_month, p.claim_month) between 1 and 12
  group by 1, 2, 3
), tax_periods as (
  select insurance_company_id, year as period_year, month as period_month,
    sum(coalesce(tax_amount, 0)) as withholding_tax_amount, count(*) as withholding_tax_entry_count
  from public.withholding_tax
  where year is not null and month between 1 and 12
  group by insurance_company_id, year, month
), periods as (
  select insurance_company_id, period_year, period_month from claim_periods
  union select insurance_company_id, period_year, period_month from payment_periods
  union select insurance_company_id, period_year, period_month from tax_periods
)
select p.insurance_company_id, p.period_year, p.period_month,
  coalesce(cp.submitted_amount, 0)::numeric as submitted_amount,
  coalesce(cp.rejected_amount, 0)::numeric as rejected_amount,
  greatest(coalesce(cp.submitted_amount, 0) - coalesce(cp.rejected_amount, 0), 0)::numeric as net_claim_amount,
  coalesce(pp.paid_amount, 0)::numeric as paid_amount,
  coalesce(tp.withholding_tax_amount, 0)::numeric as withholding_tax_amount,
  greatest(coalesce(cp.submitted_amount, 0) - coalesce(cp.rejected_amount, 0) - coalesce(pp.paid_amount, 0) - coalesce(tp.withholding_tax_amount, 0), 0)::numeric as outstanding_amount,
  case when coalesce(pp.payment_entry_count, 0) > 0 and coalesce(tp.withholding_tax_entry_count, 0) > 0 then 'actual' else 'provisional' end::text as outstanding_status,
  coalesce(pp.payment_entry_count, 0)::integer as payment_entry_count,
  coalesce(tp.withholding_tax_entry_count, 0)::integer as withholding_tax_entry_count
from periods p
left join claim_periods cp using (insurance_company_id, period_year, period_month)
left join payment_periods pp using (insurance_company_id, period_year, period_month)
left join tax_periods tp using (insurance_company_id, period_year, period_month);

comment on view public.claims_outstanding_periods is 'Canonical system-calculated claims outstanding by insurer and claim period. Outstanding = submitted - rejected - payments - withholding tax, floored at zero. A period is actual only when both payment and withholding-tax entries have been recorded; otherwise it is provisional.';
grant select on public.claims_outstanding_periods to authenticated;
