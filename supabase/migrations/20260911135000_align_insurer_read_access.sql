-- Insurance company records are reference data needed by operational read-only screens.
-- Keep all mutations restricted to masterdata.write while allowing the minimum
-- operational read permissions required by claims, payments, preauth, reports,
-- and analytics workflows.
drop policy if exists insurance_companies_permission_select on public.insurance_companies;
drop policy if exists "permission read insurance companies" on public.insurance_companies;
drop policy if exists insurance_companies_select on public.insurance_companies;

create policy insurance_companies_select
on public.insurance_companies
for select
to authenticated
using (
  public.current_user_has_permission('masterdata.write')
  or public.current_user_has_permission('claims.read')
  or public.current_user_has_permission('payments.read')
  or public.current_user_has_permission('preauth.read')
  or public.current_user_has_permission('reports.read')
  or public.current_user_has_permission('analytics.read')
);
