-- RAP facility isolation and read-policy foundation (design migration only).
-- Intentionally NOT wired into supabase/migrations. Requires review with the
-- production permission catalogue before activation. This reuses the existing
-- public.facilities / public.user_has_facility_access tenancy boundary.

alter table rap.rap_rejection_advice add column if not exists facility_id uuid references public.facilities(id) on delete restrict;
alter table rap.rap_rendered_document add column if not exists facility_id uuid references public.facilities(id) on delete restrict;
alter table rap.rap_ai_action_log add column if not exists facility_id uuid references public.facilities(id) on delete restrict;
alter table rap.rap_ai_approval_token add column if not exists facility_id uuid references public.facilities(id) on delete restrict;
alter table rap.rap_ai_approval_event add column if not exists facility_id uuid references public.facilities(id) on delete restrict;
alter table rap.rap_ai_system_card add column if not exists facility_id uuid references public.facilities(id) on delete restrict;
alter table rap.rap_model_version_log add column if not exists facility_id uuid references public.facilities(id) on delete restrict;
alter table rap.rap_human_oversight_log add column if not exists facility_id uuid references public.facilities(id) on delete restrict;
alter table rap.rap_ai_incident add column if not exists facility_id uuid references public.facilities(id) on delete restrict;
alter table rap.rap_data_protection_register add column if not exists facility_id uuid references public.facilities(id) on delete restrict;
alter table rap.rap_consent_record add column if not exists facility_id uuid references public.facilities(id) on delete restrict;
alter table rap.rap_dsr_request add column if not exists facility_id uuid references public.facilities(id) on delete restrict;
alter table rap.rap_retention_event add column if not exists facility_id uuid references public.facilities(id) on delete restrict;
alter table rap.rap_audit_finding add column if not exists facility_id uuid references public.facilities(id) on delete restrict;
alter table rap.rap_it_report add column if not exists facility_id uuid references public.facilities(id) on delete restrict;
alter table rap.rap_kb_gap_queue add column if not exists facility_id uuid references public.facilities(id) on delete restrict;

create index if not exists idx_rap_advice_facility_time on rap.rap_rejection_advice(facility_id, created_at desc);
create index if not exists idx_rap_approval_facility_status on rap.rap_ai_approval_token(facility_id, status, expires_at);
create index if not exists idx_rap_action_facility_time on rap.rap_ai_action_log(facility_id, created_at desc);
create index if not exists idx_rap_incident_facility_time on rap.rap_ai_incident(facility_id, detected_at desc);
create index if not exists idx_rap_audit_finding_facility_time on rap.rap_audit_finding(facility_id, created_at desc);
create index if not exists idx_rap_it_report_facility_time on rap.rap_it_report(facility_id, created_at desc);

-- Enable RLS everywhere; unspecified operations remain denied until reviewed
-- policies and least-privilege grants are added by the deployment owner.
do $$
declare
  t text;
begin
  foreach t in array array[
    'rap_rejection_advice', 'rap_parsed_item', 'rap_matched_diagnosis',
    'rap_rendered_document', 'rap_cost_item_diagnosis_map', 'rap_kb_gap_queue',
    'rap_ai_action_log', 'rap_ai_approval_token', 'rap_ai_approval_event',
    'rap_ai_system_card', 'rap_model_version_log', 'rap_human_oversight_log',
    'rap_ai_incident', 'rap_data_protection_register', 'rap_consent_record',
    'rap_dsr_request', 'rap_retention_event', 'rap_audit_finding', 'rap_it_report'
  ] loop
    execute format('alter table rap.%I enable row level security', t);
  end loop;
end $$;

drop policy if exists rap_advice_select_facility on rap.rap_rejection_advice;
create policy rap_advice_select_facility on rap.rap_rejection_advice
  for select to authenticated
  using (facility_id is not null and public.user_has_facility_access(facility_id));

drop policy if exists rap_parsed_item_select_facility on rap.rap_parsed_item;
create policy rap_parsed_item_select_facility on rap.rap_parsed_item
  for select to authenticated
  using (exists (
    select 1 from rap.rap_rejection_advice a
    where a.id = rap_parsed_item.advice_id
      and a.facility_id is not null
      and public.user_has_facility_access(a.facility_id)
  ));

drop policy if exists rap_matched_diagnosis_select_facility on rap.rap_matched_diagnosis;
create policy rap_matched_diagnosis_select_facility on rap.rap_matched_diagnosis
  for select to authenticated
  using (exists (
    select 1
      from rap.rap_parsed_item i
      join rap.rap_rejection_advice a on a.id = i.advice_id
     where i.id = rap_matched_diagnosis.parsed_item_id
       and a.facility_id is not null
       and public.user_has_facility_access(a.facility_id)
  ));

drop policy if exists rap_rendered_document_select_facility on rap.rap_rendered_document;
create policy rap_rendered_document_select_facility on rap.rap_rendered_document
  for select to authenticated
  using (facility_id is not null and public.user_has_facility_access(facility_id));

drop policy if exists rap_approval_token_select_owner on rap.rap_ai_approval_token;
create policy rap_approval_token_select_owner on rap.rap_ai_approval_token
  for select to authenticated
  using (
    requested_by = (select auth.uid())
    and facility_id is not null
    and public.user_has_facility_access(facility_id)
  );

drop policy if exists rap_approval_event_select_actor on rap.rap_ai_approval_event;
create policy rap_approval_event_select_actor on rap.rap_ai_approval_event
  for select to authenticated
  using (
    actor_id = (select auth.uid())
    and facility_id is not null
    and public.user_has_facility_access(facility_id)
  );

drop policy if exists rap_retention_event_select_facility on rap.rap_retention_event;
create policy rap_retention_event_select_facility on rap.rap_retention_event
  for select to authenticated
  using (exists (
    select 1 from rap.rap_rejection_advice a
    where a.id = rap_retention_event.advice_id
      and a.facility_id is not null
      and public.user_has_facility_access(a.facility_id)
  ));

-- No direct client write policies are created. A trusted server adapter must
-- validate actor permissions, set facility_id from authenticated context, and
-- use atomic RPCs for mutations. Rows with null facility_id are inaccessible.
