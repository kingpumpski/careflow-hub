-- RAP schema definition (design migration; activation is deployment-gated)
-- Module: Rejection Advice Processing (RAP)
-- Target: PostgreSQL / Supabase-compatible
--
-- IMPORTANT:
-- 1. This migration is intentionally under modules/rap and is not wired into
--    the production Supabase migration chain in this step.
-- 2. Core-domain references remain UUID read-only references until the exact
--    core table contracts are approved. No core table is modified here.
-- 3. Audit/event tables are append-only. Application roles receive no UPDATE
--    or DELETE privileges on those tables.

create extension if not exists pgcrypto;

create schema if not exists rap;

create table if not exists rap.rap_rejection_advice (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null,
  partner_id uuid not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  storage_key text not null,
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-fA-F]{64}$'),
  uploaded_by uuid not null,
  uploaded_at timestamptz not null default now(),
  status text not null check (status in ('UPLOADED','PARSED','MATCHED','DRAFTED','APPROVED','FINALIZED','REJECTED','CANCELLED','DELETED')),
  retention_days integer not null default 90 check (retention_days >= 0),
  delete_after timestamptz,
  compressed_at timestamptz,
  compression_algo text,
  compression_ratio numeric(12,6),
  legal_hold boolean not null default false,
  legal_hold_reason text,
  legal_hold_set_by uuid,
  legal_hold_set_at timestamptz,
  deleted_at timestamptz,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (checksum_sha256, partner_id)
);

create table if not exists rap.rap_parsed_item (
  id uuid primary key default gen_random_uuid(),
  advice_id uuid not null references rap.rap_rejection_advice(id) on delete restrict,
  sheet_row_col_refs jsonb not null,
  cost_item_code text,
  description text,
  qty numeric,
  amount numeric(18,2),
  reason_text text,
  existing_diagnosis_text text,
  normalized_cost_item_code text,
  confidence numeric(5,4) check (confidence between 0 and 1),
  status text not null check (status in ('PARSED','MATCHED','UNRESOLVED','ESCALATED','DRAFTED','APPROVED')),
  created_at timestamptz not null default now()
);

create table if not exists rap.rap_matched_diagnosis (
  id uuid primary key default gen_random_uuid(),
  parsed_item_id uuid not null references rap.rap_parsed_item(id) on delete restrict,
  diagnosis_code text not null,
  support_type text not null check (support_type in ('REQUIRED','SUPPORTING','CONTRAINDICATED')),
  mapping_version text not null,
  source text not null,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  approved_by uuid,
  approved_at timestamptz,
  override_reason text,
  created_at timestamptz not null default now()
);

create table if not exists rap.rap_rendered_document (
  id uuid primary key default gen_random_uuid(),
  advice_id uuid not null references rap.rap_rejection_advice(id) on delete restrict,
  storage_key text not null,
  checksum text not null,
  format text not null check (format in ('XLSX','XLS','CSV','TSV','PDF','DOCX','IMAGE')),
  rendered_by uuid not null,
  rendered_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz
);

create table if not exists rap.rap_cost_item_diagnosis_map (
  id uuid primary key default gen_random_uuid(),
  cost_item_code text not null,
  diagnosis_code text not null,
  support_type text not null check (support_type in ('REQUIRED','SUPPORTING','CONTRAINDICATED')),
  applies_to text not null check (applies_to in ('CLAIM_REJECTION','PRE_AUTH','BOTH')),
  source text not null,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  effective_from timestamptz not null,
  effective_to timestamptz,
  version text not null,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  soft_deleted_at timestamptz,
  check (effective_to is null or effective_to > effective_from)
);

create table if not exists rap.rap_kb_gap_queue (
  id uuid primary key default gen_random_uuid(),
  cost_item_code text not null,
  detected_at timestamptz not null default now(),
  status text not null check (status in ('OPEN','IN_REVIEW','RESOLVED','WONT_FIX')),
  resolved_at timestamptz,
  resolved_by uuid
);

create table if not exists rap.rap_ai_action_log (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid not null,
  persona text not null check (persona in ('CLAIMS_SPECIALIST','PROJECT_ADMINISTRATOR','IT_OFFICER')),
  user_id uuid,
  intent text not null,
  model text,
  tool_calls_json jsonb not null default '[]'::jsonb,
  inputs_hash text not null,
  outputs_json jsonb,
  tokens_prompt integer,
  tokens_completion integer,
  latency_ms integer,
  cost_usd numeric(18,8),
  status text not null,
  confidence numeric(5,4) check (confidence between 0 and 1),
  requires_approval boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists rap.rap_ai_approval_token (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  payload_hash text not null,
  requested_by uuid not null,
  approved_by uuid not null,
  approved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  status text not null check (status in ('ISSUED','USED','EXPIRED','REVOKED','REJECTED')),
  check (expires_at > approved_at)
);

create table if not exists rap.rap_ai_system_card (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  personas_json jsonb not null,
  intended_purpose text not null,
  data_flows_json jsonb not null,
  model_list_json jsonb not null,
  limitations text not null,
  human_oversight_design text not null,
  data_residency_compliance text not null,
  model_hosting_location text not null,
  cross_border_transfer_justification text,
  created_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz
);

create table if not exists rap.rap_model_version_log (
  id uuid primary key default gen_random_uuid(),
  persona text not null check (persona in ('CLAIMS_SPECIALIST','PROJECT_ADMINISTRATOR','IT_OFFICER')),
  provider text not null,
  model_name text not null,
  version text not null,
  hosting_location text not null,
  data_residency_verified boolean not null default false,
  deployed_at timestamptz not null,
  retired_at timestamptz,
  eval_results_json jsonb,
  red_team_results_json jsonb,
  approved_by uuid,
  approved_at timestamptz
);

create table if not exists rap.rap_human_oversight_log (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid not null,
  persona text not null,
  action text not null,
  ai_recommendation_json jsonb not null,
  human_decision text not null,
  human_id uuid not null,
  rationale text not null,
  decided_at timestamptz not null default now()
);

create table if not exists rap.rap_ai_incident (
  id uuid primary key default gen_random_uuid(),
  incident_type text not null,
  persona text,
  severity text not null,
  description text not null,
  evidence_json jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  reported_at timestamptz,
  resolved_at timestamptz,
  resolution text,
  csa_reportable boolean not null default false,
  csa_reported_at timestamptz,
  csa_reference text,
  dpa_reportable boolean not null default false,
  dpa_reported_at timestamptz,
  dpa_reference text
);

create table if not exists rap.rap_data_protection_register (
  id uuid primary key default gen_random_uuid(),
  processing_activity text not null,
  purpose text not null,
  lawful_basis text not null,
  data_categories jsonb not null,
  data_subjects jsonb not null,
  recipients jsonb not null,
  retention_period text not null,
  security_measures jsonb not null,
  dpo_review_date date,
  dpo_approved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists rap.rap_consent_record (
  id uuid primary key default gen_random_uuid(),
  data_subject_id uuid not null,
  purpose text not null,
  consent_text_version text not null,
  granted_at timestamptz not null,
  withdrawn_at timestamptz,
  withdrawal_reason text,
  source text not null
);

create table if not exists rap.rap_dsr_request (
  id uuid primary key default gen_random_uuid(),
  data_subject_id uuid not null,
  request_type text not null check (request_type in ('ACCESS','CORRECTION','WITHDRAWAL','OBJECTION_AUTOMATED','ERASURE')),
  received_at timestamptz not null default now(),
  due_at timestamptz not null,
  status text not null,
  response_at timestamptz,
  response_summary text,
  handled_by uuid
);

create table if not exists rap.rap_retention_event (
  id uuid primary key default gen_random_uuid(),
  advice_id uuid not null references rap.rap_rejection_advice(id) on delete restrict,
  artifact_type text not null,
  event_type text not null,
  scheduled_for timestamptz,
  executed_at timestamptz,
  notified_users_json jsonb not null default '[]'::jsonb,
  actor_id uuid,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists rap.rap_audit_finding (
  id uuid primary key default gen_random_uuid(),
  persona text not null check (persona = 'PROJECT_ADMINISTRATOR'),
  category text not null,
  severity text not null,
  evidence_json jsonb not null,
  recommendation text not null,
  status text not null,
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);

create table if not exists rap.rap_it_report (
  id uuid primary key default gen_random_uuid(),
  persona text not null check (persona = 'IT_OFFICER'),
  topic text not null,
  summary text not null,
  sources_json jsonb not null,
  relevance text not null,
  status text not null,
  actioned_by uuid,
  actioned_at timestamptz,
  created_at timestamptz not null default now()
);

-- Required indexes for deterministic matching, retention scheduling, audit lookup.
create index if not exists idx_rap_parsed_item_advice on rap.rap_parsed_item(advice_id);
create index if not exists idx_rap_parsed_item_code on rap.rap_parsed_item(normalized_cost_item_code);
create index if not exists idx_rap_matched_diagnosis_item on rap.rap_matched_diagnosis(parsed_item_id);
create index if not exists idx_rap_map_lookup on rap.rap_cost_item_diagnosis_map(cost_item_code, applies_to, effective_from, effective_to);
create index if not exists idx_rap_retention_due on rap.rap_rejection_advice(delete_after) where deleted_at is null and legal_hold = false;
create index if not exists idx_rap_retention_events_idempotency on rap.rap_retention_event(advice_id, event_type, scheduled_for);
create unique index if not exists uq_rap_retention_event_idempotency on rap.rap_retention_event(advice_id, event_type, scheduled_for) where scheduled_for is not null;
create index if not exists idx_rap_ai_action_correlation on rap.rap_ai_action_log(correlation_id, created_at);
create index if not exists idx_rap_ai_approval_active on rap.rap_ai_approval_token(payload_hash, status, expires_at);
create index if not exists idx_rap_dsr_subject on rap.rap_dsr_request(data_subject_id, received_at);

-- Append-only enforcement for governance/audit/event tables.
create or replace function rap.reject_governance_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'RAP governance/audit tables are append-only';
end;
$$;

DO $$
declare
  t text;
begin
  foreach t in array array[
    'rap_ai_action_log',
    'rap_ai_approval_token',
    'rap_ai_system_card',
    'rap_model_version_log',
    'rap_human_oversight_log',
    'rap_ai_incident',
    'rap_retention_event'
  ] loop
    execute format('drop trigger if exists %I_append_only on rap.%I', t, t);
    execute format('create trigger %I_append_only before update or delete on rap.%I for each row execute function rap.reject_governance_mutation()', t, t);
  end loop;
end $$;

-- Application-role privileges are deliberately not granted here. Deployment
-- must grant least privilege after the project's concrete Supabase roles and
-- RLS conventions are reviewed. In particular, audit UPDATE/DELETE remain
-- forbidden.

comment on schema rap is 'Rejection Advice Processing isolated module; Ghana-first PHI governance';
comment on table rap.rap_rejection_advice is 'RAP rejection advice metadata and immutable artifact lifecycle';
comment on table rap.rap_ai_action_log is 'Append-only AI action audit trail with redacted/hashed inputs';
comment on table rap.rap_ai_approval_token is 'Single-use human approval token state';
comment on table rap.rap_retention_event is 'Append-only retention/deletion event history';
