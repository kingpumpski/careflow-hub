-- Defense-in-depth: ensure every client-accessible sensitive table remains protected by RLS.
-- Existing migrations define the permission policies; this migration only makes the
-- RLS requirement explicit so a future schema change cannot accidentally leave a
-- sensitive table exposed through authenticated table grants.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'user_roles',
    'profiles',
    'insurance_companies',
    'client_companies',
    'doctors',
    'procedures',
    'patients',
    'pre_authorizations',
    'preauth_items',
    'claims',
    'payments',
    'withholding_tax',
    'system_settings',
    'notifications',
    'diagnosis_codes',
    'procedure_templates',
    'preauth_catalog_items',
    'preauth_versions',
    'preauth_email_log',
    'ledger_entries',
    'audit_logs'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
    end if;
  end loop;
end $$;
