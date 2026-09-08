# CareFlow Hub — Authorization & Permission Matrix

This matrix defines the intended authorization boundary for the application. UI checks are convenience controls; database RLS and server-side Edge Functions are authoritative.

## Permission model

**User → Role → Default permissions → Per-user overrides → Server authorization → Facility scope**

An explicit user override takes precedence over the role default for that permission. A denied override therefore removes the corresponding role-derived permission.

## Operational data

| Resource | Read | Create / Update | Delete | Facility scope | Enforcement |
|---|---|---|---|---|---|
| Insurance companies | `masterdata.write` | `masterdata.write` | Admin / Superuser | Required | RLS |
| Client companies | `claims.read` or `masterdata.write` | `masterdata.write` | Admin / Superuser | Required | RLS |
| Doctors | `preauth.read`, `claims.read` or `masterdata.write` | `masterdata.write` | Admin / Superuser | Required | RLS |
| Procedures | `preauth.read`, `claims.read` or `masterdata.write` | `masterdata.write` | Admin / Superuser | Required | RLS |
| Patients | `preauth.read` or `claims.read` | `preauth.write` or `claims.write` | Admin / Superuser | Required | RLS |
| Pre-authorizations | `preauth.read` | `preauth.write` | Admin / Superuser | Required | RLS |
| Pre-authorization items | `preauth.read` | `preauth.write` | Admin / Superuser | Required | RLS |
| Claims | `claims.read` | `claims.write` | Admin / Superuser | Required | RLS |
| Payments | `payments.read` | `payments.write` | Admin / Superuser | Required | RLS |
| Withholding tax | `payments.read` | `payments.write` | Admin / Superuser | Required | RLS |

## Identity and access management

| Resource / action | Allowed authority | Client direct mutation |
|---|---|---|
| Read own role | Authenticated user | Select own row only |
| List users | Superuser | No |
| Create user | Superuser | No |
| Change role | Superuser | No |
| Allocate per-user privileges | Superuser | No |
| Delete user | Superuser, excluding self | No |
| Set another user's password | Superuser | No |
| Request password reset | Superuser workflow | No direct admin API |
| Manage permission catalogue | Superuser | No |
| Manage role defaults | Superuser | No |
| Manage permission overrides | Superuser | No |

Role mutations are intentionally routed through `admin-user-action`, which validates the authenticated caller before using the service role. The `user_roles` Data API surface has no authenticated INSERT/UPDATE/DELETE policy.

## Non-operational security boundaries

- Facility membership is required wherever operational records carry a `facility_id`.
- Anonymous users receive no operational access.
- Destructive operational deletes are not represented by a generic granular permission and remain restricted to `admin` / `superuser`.
- Service-role credentials remain server-side and are never exposed to the browser.
- Authorization must never rely on editable `user_metadata` claims.
- The `preauth.approve` permission does **not** authorize insurer approval. CareFlow Hub's current workflow ends when the authorization-request PDF and email package are prepared for final human review/send.

## Edge Function boundary

### `admin-user-action`

- Authentication: required bearer token.
- Authorization: `superuser` role required.
- Capabilities: controlled account creation, role allocation, per-user permission overrides, password administration, and account deletion.
- Self-protection: a superuser cannot self-delete or self-demote.
- Errors: generic administrative failure responses; sensitive server details remain in server logs.

### Legacy pre-authorization submission execution

External insurer submission execution is disabled. The supported workflow prepares the request document and email handoff only; it does not claim insurer delivery, approval, authorization number, or response status.

## Review checklist for future schema/RPC changes

Before adding a protected table, RPC, view, or Edge Function:

1. Define the business permission required for each operation.
2. Define facility/tenant scope where applicable.
3. Enforce authorization server-side; never rely only on React route guards.
4. Deny anonymous access explicitly.
5. Avoid SECURITY DEFINER unless necessary; when used, fix `search_path` and keep privileges minimal.
6. Ensure service-role operations are reachable only through an authenticated, authorized server boundary.
7. Add a focused test or verification query for privilege escalation and cross-facility access.
8. Update this matrix in the same change.
