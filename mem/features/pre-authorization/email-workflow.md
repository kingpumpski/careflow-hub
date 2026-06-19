---
name: Pre-Authorization Email Workflow
description: Complete Request flow: PDF generation, mailto draft with insurer TO + additional_emails CC + hospital claims CC, dynamic subject/body, lifecycle timestamps
type: feature
---
Pre-Authorization "Complete Request" (src/pages/PreAuthorization.tsx) does three things atomically:
1. Calls exportPreAuthPDF — downloads branded PDF
2. Opens mailto draft. TO = insurer.email. CC = insurer.additional_emails[] + system_settings.claims_cc_emails (comma-separated). Subject = `PRE-AUTHORIZATION REQUEST – {PATIENT NAME}`. Body uses "has or is scheduled to undergo" when procedure_date >= today, else "has successfully undergone". Diagnosis bullets aggregate custom_diagnoses[] + diagnosis text. Signature pulls officer_name/position/phone/claims_sender_email/provider_name from system_settings.
3. Updates pre_authorizations: status='completed', submitted_at=now(), email_sent_at=now().

SMTP settings (smtp_host/port/user/password/secure) live in system_settings via Settings → Email (SMTP) tab. Currently the front-end uses mailto fallback only; SMTP values are stored for a future server-side sender edge function.

Hospital department fields stored: claims_department, claims_sender_email, claims_reply_to, claims_cc_emails, officer_name, officer_position, officer_phone.

insurance_companies.additional_emails text[] — UI accepts comma-separated, persisted as array.

pre_authorizations new columns: accommodation_days, clinical_notes, approval_notes, custom_diagnoses[], diagnosis_ids[], template_id, submitted_at, approved_at, approved_by, email_sent_at, rejection_reason.