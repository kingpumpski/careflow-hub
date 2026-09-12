# RAP database ERD

The schema is isolated under the `rap` PostgreSQL schema. Core-domain identifiers are intentionally represented as UUID read-only references in this step because the exact core table contracts have not yet been approved. No core table is changed.

```mermaid
erDiagram
    RAP_REJECTION_ADVICE ||--o{ RAP_PARSED_ITEM : contains
    RAP_PARSED_ITEM ||--o{ RAP_MATCHED_DIAGNOSIS : produces
    RAP_REJECTION_ADVICE ||--o{ RAP_RENDERED_DOCUMENT : renders
    RAP_REJECTION_ADVICE ||--o{ RAP_RETENTION_EVENT : lifecycle
    RAP_COST_ITEM_DIAGNOSIS_MAP }o--o{ RAP_PARSED_ITEM : deterministic_lookup
    RAP_PARSED_ITEM ||--o{ RAP_KB_GAP_QUEUE : unresolved_code

    RAP_REJECTION_ADVICE {
      uuid id PK
      uuid claim_id FK_READ_ONLY
      uuid partner_id FK_READ_ONLY
      text original_filename
      text mime_type
      bigint size_bytes
      text storage_key
      text checksum_sha256
      uuid uploaded_by
      timestamptz uploaded_at
      text status
      int retention_days
      timestamptz delete_after
      boolean legal_hold
      timestamptz deleted_at
    }

    RAP_PARSED_ITEM {
      uuid id PK
      uuid advice_id FK
      jsonb sheet_row_col_refs
      text cost_item_code
      text description
      numeric qty
      numeric amount
      text reason_text
      text existing_diagnosis_text
      text normalized_cost_item_code
      numeric confidence
      text status
    }

    RAP_MATCHED_DIAGNOSIS {
      uuid id PK
      uuid parsed_item_id FK
      text diagnosis_code
      text support_type
      text mapping_version
      text source
      numeric confidence
      uuid approved_by
      timestamptz approved_at
    }

    RAP_RENDERED_DOCUMENT {
      uuid id PK
      uuid advice_id FK
      text storage_key
      text checksum
      text format
      uuid rendered_by
      timestamptz rendered_at
      uuid approved_by
      timestamptz approved_at
    }

    RAP_COST_ITEM_DIAGNOSIS_MAP {
      uuid id PK
      text cost_item_code
      text diagnosis_code
      text support_type
      text applies_to
      text source
      numeric confidence
      timestamptz effective_from
      timestamptz effective_to
      text version
    }

    RAP_KB_GAP_QUEUE {
      uuid id PK
      text cost_item_code
      timestamptz detected_at
      text status
      timestamptz resolved_at
      uuid resolved_by
    }
```

## Governance/audit entities

The following tables are intentionally independent of the business-data graph and are append-only at the database trigger boundary:

- `rap_ai_action_log`
- `rap_ai_approval_token`
- `rap_ai_system_card`
- `rap_model_version_log`
- `rap_human_oversight_log`
- `rap_ai_incident`
- `rap_retention_event`

Ghana governance entities:

- `rap_data_protection_register`
- `rap_consent_record`
- `rap_dsr_request`

Administrator/IT entities:

- `rap_audit_finding`
- `rap_it_report`

## Referential-integrity policy

RAP-owned relationships use restrictive foreign keys. No `CASCADE` behavior is used. References to claims, partners, users, patients/data subjects, diagnosis masters, and notification recipients remain adapter-owned until the corresponding core contracts are explicitly mapped.

This prevents RAP from silently taking ownership of core data lifecycle decisions.
