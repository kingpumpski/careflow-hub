# RAP host integration review (production review only)

**Status:** read-only discovery and isolated-branch implementation only. No RAP migrations have been applied to Supabase, no Edge Function has been deployed, no production data has been written, and no merge is authorized.

## Reviewed host

- Supabase project ref: `jajfdgknctzqypdtvmxo`
- Project label: `claims tracker`
- Region: `eu-west-1`
- Existing tenancy primitives: `public.facilities`, `public.facility_memberships`, and `public.user_has_facility_access(uuid)`.
- Existing authorization primitives: `public.app_permissions`, `public.role_permissions`, `public.user_permission_overrides`, `public.get_my_permissions()`, and `public.current_user_has_permission(text)`.
- Existing audit primitives: `public.audit_logs` and `public.security_audit_log`.
- Existing in-app notification table: `public.notifications`, with `user_id`, `title`, `message`, `read`, and `created_at`; its inspected RLS policies scope reads and updates to the recipient.
- Edge Functions observed during read-only discovery: `admin-user-action`, `document-transcribe`, `ai-dedup-check`, and `chat`. No dedicated durable notification-delivery worker was identified in that list.

## Decisions for the integration

### Authorization and approval

Use the host's authenticated server identity, facility membership, and permission resolver. Do not trust requester, approver, role, facility, or permission claims supplied by the browser.

The host permission catalogue includes `claims.write`, `preauth.write`, `preauth.approve`, `audit.read`, and `settings.manage`, but it does not define RAP-specific permissions. The concrete adapter must use an explicitly reviewed action-to-existing-permission mapping and enforce facility scope plus requester/approver separation. Do not treat `preauth.approve` as universal approval authority for unrelated RAP actions. Unknown actions or unmapped permissions must be denied.

Approval issuance now requires the host adapter to write the ISSUED token and immutable audit event atomically in one transaction/RPC. A pair of independent writes is not an acceptable implementation. The HMAC signing secret must be server-side only and is never supplied by the client.

### Notifications

The existing `public.notifications` table supports recipient-scoped in-app messages but does not itself establish delivery through email, SMS, push, or another external provider. Before binding RAP to the existing delivery system, identify and verify the host's actual provider/queue, delivery idempotency, retry/dead-letter behavior, consent/preferences, and redaction requirements. Do not create a second notification system or activate the RAP outbox migration as a shortcut. If the host delivery mechanism cannot meet those controls, leave RAP delivery disabled until an approved adapter is ready.

### Workbook preservation

The application dependency manifest contains SheetJS `xlsx`, but dependency presence alone is not evidence of round-trip preservation for all required workbook features. The RAP exporter must preserve original sheet names/order, styles, formulas, merged ranges, dimensions, hidden states, workbook properties, and supported metadata; it must reload the serialized bytes, compare the approved change set, and hash the final bytes. Verify these guarantees with representative sanitized workbooks and a feature-by-feature fidelity test before enabling XLS/XLSX export. Until then, XLS/XLSX export must fail closed. Do not silently convert a workbook to CSV/TSV when the requirement is to preserve the workbook.

### Database and deployment boundary

- RAP SQL files remain under `modules/rap/migrations` and are not part of the host's active `supabase/migrations` chain.
- Do not run `apply_migration`, add production grants, enable RAP, or deploy an Edge Function without explicit approval.
- Before any later deployment proposal, review table ownership, RLS policies, trusted server-role grants, facility backfill strategy, storage bucket/object permissions, audit atomicity, and rollback steps.
- Production review may use read-only metadata, policy, permission-catalogue, and function-source inspection. Do not retrieve or print secrets or customer/claims content.

## Remaining pre-activation gates

1. Confirm the exact existing notification provider/worker and its deployment owner without exposing credentials.
2. Approve a documented mapping from each RAP action to existing host permissions and allowed approver roles.
3. Implement a server-only Supabase adapter that derives identity and facility context from the verified session and performs approval-token-plus-audit persistence atomically.
4. Prove workbook round-trip fidelity against sanitized XLS/XLSX fixtures, including formulas, styles, merged cells, hidden sheets, workbook metadata, and approved-cell mutation boundaries.
5. Test RLS and facility isolation using multiple real test identities, concurrent token replay, transaction rollback, notification retry/idempotency, and retention/storage recovery in a disposable non-production environment.
6. Review Supabase security-advisor findings and decide remediations with the host owner; do not bundle unrelated production security changes into RAP activation.
7. Obtain explicit approval before applying RAP migrations, enabling RAP, deploying workers/functions, or merging the branch.

## Read-only security review notes

The current Supabase security advisor reports:
- RLS enabled on `public.role_permissions` without a client policy.
- Five authenticated-callable SECURITY DEFINER functions, including `current_user_has_any_role`, `current_user_has_permission`, `finalize_preauthorization_handoff`, `get_my_permissions`, and `user_has_facility_access`.
- Leaked-password protection disabled.

These are host-application findings, not RAP migration changes. Preserve the existing behavior until reviewed against the host's permission/RLS design; do not automatically change grants or authentication settings as part of this isolated RAP work.

