-- Align payment reconciliation read access with the Payments page.
-- Payments readers already have access to payment and claim data, and the
-- reconciliation screen displays withholding-tax amounts alongside those records.
-- Keep WHT mutations restricted to ledger writers.

drop policy if exists "permission read withholding tax" on public.withholding_tax;
create policy "permission read withholding tax"
  on public.withholding_tax for select to authenticated
  using (
    public.current_user_has_permission('payments.read')
    or public.current_user_has_permission('ledger.read')
    or public.current_user_has_permission('reports.read')
  );
