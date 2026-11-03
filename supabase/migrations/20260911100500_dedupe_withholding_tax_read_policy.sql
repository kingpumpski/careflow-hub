-- Keep one canonical WHT SELECT policy after the payment reconciliation alignment.
drop policy if exists "withholding_tax_select_permission" on public.withholding_tax;
