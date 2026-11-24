-- Reversible teardown for modules/rap/migrations/001_rap_schema.sql
-- Execute only when RAP is disabled and a reviewed rollback is approved.

drop trigger if exists rap_ai_action_log_append_only on rap.rap_ai_action_log;
drop trigger if exists rap_ai_approval_token_append_only on rap.rap_ai_approval_token;
drop trigger if exists rap_ai_system_card_append_only on rap.rap_ai_system_card;
drop trigger if exists rap_model_version_log_append_only on rap.rap_model_version_log;
drop trigger if exists rap_human_oversight_log_append_only on rap.rap_human_oversight_log;
drop trigger if exists rap_ai_incident_append_only on rap.rap_ai_incident;
drop trigger if exists rap_retention_event_append_only on rap.rap_retention_event;

drop function if exists rap.reject_governance_mutation();

drop table if exists rap.rap_it_report;
drop table if exists rap.rap_audit_finding;
drop table if exists rap.rap_retention_event;
drop table if exists rap.rap_dsr_request;
drop table if exists rap.rap_consent_record;
drop table if exists rap.rap_data_protection_register;
drop table if exists rap.rap_ai_incident;
drop table if exists rap.rap_human_oversight_log;
drop table if exists rap.rap_model_version_log;
drop table if exists rap.rap_ai_system_card;
drop table if exists rap.rap_ai_approval_token;
drop table if exists rap.rap_ai_action_log;
drop table if exists rap.rap_kb_gap_queue;
drop table if exists rap.rap_cost_item_diagnosis_map;
drop table if exists rap.rap_rendered_document;
drop table if exists rap.rap_matched_diagnosis;
drop table if exists rap.rap_parsed_item;
drop table if exists rap.rap_rejection_advice;

drop schema if exists rap;
