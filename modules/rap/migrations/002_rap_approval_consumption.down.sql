-- Rollback for 002_rap_approval_consumption.sql.
-- Run only during an approved rollback window after stopping RAP consumers.

drop function if exists rap.consume_approval_token(uuid, uuid, text, text);
drop trigger if exists rap_ai_approval_event_append_only on rap.rap_ai_approval_event;
drop function if exists rap.reject_approval_event_mutation();
drop table if exists rap.rap_ai_approval_event;

-- Do not recreate the old append-only trigger on rap_ai_approval_token:
-- atomic single-use consumption requires the trusted function to transition
-- ISSUED -> USED. Token issuance/revocation history belongs in append-only events.
