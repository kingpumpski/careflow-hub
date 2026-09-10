-- Harden remaining sensitive data tables and storage policies.
--
-- Keep read permissions separate from write permissions so a role that can
-- maintain master data or ledger entries does not automatically gain read
-- access unless the corresponding read permission is granted.

-- diagnosis_codes
 drop policy if exists "Authenticated read diagnosis_codes" on public.diagnosis_codes;
drop policy if exists "Authenticated insert diagnosis_codes" on public.diagnosis_codes;
drop policy if exists "Authenticated update diagnosis_codes" on public.diagnosis_codes;
drop policy if exists "Authenticated delete diagnosis_codes" on public.diagnosis_codes;
create policy "Permission read diagnosis codes"
  on public.diagnosis_codes for select to authenticated
  using (public.current_user_has_permission('preauth.read'));
create policy "Permission insert diagnosis codes"
  on public.diagnosis_codes for insert to authenticated
  with check (public.current_user_has_permission('masterdata.write'));
create policy "Permission update diagnosis codes"
  on public.diagnosis_codes for update to authenticated
  using (public.current_user_has_permission('masterdata.write'))
  with check (public.current_user_has_permission('masterdata.write'));
create policy "Permission delete diagnosis codes"
  on public.diagnosis_codes for delete to authenticated
  using (public.current_user_has_permission('masterdata.write'));

-- procedure_templates
 drop policy if exists "Authenticated read procedure_templates" on public.procedure_templates;
drop policy if exists "Authenticated insert procedure_templates" on public.procedure_templates;
drop policy if exists "Authenticated update procedure_templates" on public.procedure_templates;
drop policy if exists "Authenticated delete procedure_templates" on public.procedure_templates;
create policy "Permission read procedure templates"
  on public.procedure_templates for select to authenticated
  using (public.current_user_has_permission('preauth.read'));
create policy "Permission insert procedure templates"
  on public.procedure_templates for insert to authenticated
  with check (public.current_user_has_permission('masterdata.write'));
create policy "Permission update procedure templates"
  on public.procedure_templates for update to authenticated
  using (public.current_user_has_permission('masterdata.write'))
  with check (public.current_user_has_permission('masterdata.write'));
create policy "Permission delete procedure templates"
  on public.procedure_templates for delete to authenticated
  using (public.current_user_has_permission('masterdata.write'));

-- preauth_catalog_items
 drop policy if exists "Authenticated read preauth catalog items" on public.preauth_catalog_items;
drop policy if exists "Authenticated insert preauth catalog items" on public.preauth_catalog_items;
drop policy if exists "Authenticated update preauth catalog items" on public.preauth_catalog_items;
drop policy if exists "Authenticated delete preauth catalog items" on public.preauth_catalog_items;
create policy "Permission read preauth catalog items"
  on public.preauth_catalog_items for select to authenticated
  using (public.current_user_has_permission('preauth.read'));
create policy "Permission insert preauth catalog items"
  on public.preauth_catalog_items for insert to authenticated
  with check (public.current_user_has_permission('masterdata.write'));
create policy "Permission update preauth catalog items"
  on public.preauth_catalog_items for update to authenticated
  using (public.current_user_has_permission('masterdata.write'))
  with check (public.current_user_has_permission('masterdata.write'));
create policy "Permission delete preauth catalog items"
  on public.preauth_catalog_items for delete to authenticated
  using (public.current_user_has_permission('masterdata.write'));

-- ledger_entries
 drop policy if exists "Authenticated read ledger" on public.ledger_entries;
drop policy if exists "Authenticated insert ledger" on public.ledger_entries;
drop policy if exists "Authenticated update ledger" on public.ledger_entries;
drop policy if exists "Authenticated delete ledger" on public.ledger_entries;
create policy "Permission read ledger entries"
  on public.ledger_entries for select to authenticated
  using (
    public.current_user_has_permission('ledger.read')
    or public.current_user_has_permission('reports.read')
  );
create policy "Permission insert ledger entries"
  on public.ledger_entries for insert to authenticated
  with check (public.current_user_has_permission('ledger.write'));
create policy "Permission update ledger entries"
  on public.ledger_entries for update to authenticated
  using (public.current_user_has_permission('ledger.write'))
  with check (public.current_user_has_permission('ledger.write'));
create policy "Permission delete ledger entries"
  on public.ledger_entries for delete to authenticated
  using (public.current_user_has_permission('ledger.write'));

-- audit_logs
-- Audit rows are generated by the SECURITY DEFINER audit trigger. Clients must
-- not be able to forge audit history, so authenticated INSERT is intentionally
-- removed rather than replaced with a permissive policy.
drop policy if exists "Authenticated read audit_logs" on public.audit_logs;
drop policy if exists "System insert audit_logs" on public.audit_logs;
create policy "Permission read audit logs"
  on public.audit_logs for select to authenticated
  using (public.current_user_has_permission('audit.read'));

-- preauth_versions: append-only history
 drop policy if exists "Authenticated can view preauth versions" on public.preauth_versions;
drop policy if exists "Authenticated can insert preauth versions" on public.preauth_versions;
create policy "Permission read preauth versions"
  on public.preauth_versions for select to authenticated
  using (public.current_user_has_permission('preauth.read'));
create policy "Permission insert preauth versions"
  on public.preauth_versions for insert to authenticated
  with check (public.current_user_has_permission('preauth.write'));

-- preauth_email_log: append-only operational history
 drop policy if exists "Authenticated can view email log" on public.preauth_email_log;
drop policy if exists "Service role manages email log" on public.preauth_email_log;
create policy "Permission read preauth email log"
  on public.preauth_email_log for select to authenticated
  using (public.current_user_has_permission('preauth.read'));
create policy "Permission insert preauth email log"
  on public.preauth_email_log for insert to authenticated
  with check (public.current_user_has_permission('preauth.write'));

-- logos storage
-- The bucket is intentionally public for logo display. Only logo mutations
-- are permission-gated here.
drop policy if exists "Authenticated users can upload logos" on storage.objects;
drop policy if exists "Authenticated users can update logos" on storage.objects;
drop policy if exists "Authenticated users can delete logos" on storage.objects;
create policy "Authorized users can upload logos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'logos'
    and public.current_user_has_permission('masterdata.write')
  );
create policy "Authorized users can update logos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'logos'
    and public.current_user_has_permission('masterdata.write')
  )
  with check (
    bucket_id = 'logos'
    and public.current_user_has_permission('masterdata.write')
  );
create policy "Authorized users can delete logos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'logos'
    and public.current_user_has_permission('masterdata.write')
  );
