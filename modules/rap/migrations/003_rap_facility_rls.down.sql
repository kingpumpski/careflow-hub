-- Rollback for 003_rap_facility_rls.sql.
-- Only run in an approved rollback window after stopping RAP readers/writers.
drop policy if exists rap_advice_select_facility on rap.rap_rejection_advice;
drop policy if exists rap_parsed_item_select_facility on rap.rap_parsed_item;
drop policy if exists rap_matched_diagnosis_select_facility on rap.rap_matched_diagnosis;
drop policy if exists rap_rendered_document_select_facility on rap.rap_rendered_document;
drop policy if exists rap_approval_token_select_owner on rap.rap_ai_approval_token;
drop policy if exists rap_approval_event_select_actor on rap.rap_ai_approval_event;
drop policy if exists rap_retention_event_select_facility on rap.rap_retention_event;

-- RLS remains enabled intentionally; removing the fail-closed boundary during
-- rollback would risk exposing records. Facility columns/indexes are retained
-- to avoid destructive loss of tenant attribution.
