/**
 * Server-side RAP authorization policy primitives.
 *
 * IMPORTANT: every field in RapAuthorizationContext must be assembled by a
 * trusted server adapter from the authenticated session, verified membership,
 * persisted permissions and server-controlled feature flags. Never construct
 * this context from request JSON or browser state. This module is a policy
 * decision helper, not an authentication provider or database/RLS replacement.
 */
export type RapOperation =
  | "READ"
  | "ANALYZE"
  | "DRAFT"
  | "APPROVE"
  | "EXPORT"
  | "SUBMIT"
  | "MANAGE_KNOWLEDGE_BASE"
  | "DELETE";

export interface RapAuthorizationContext {
  authenticated: boolean;
  activeUser: boolean;
  userId: string;
  tenantId: string;
  facilityId: string;
  tenantMembershipVerified: boolean;
  facilityMembershipVerified: boolean;
  grantedPermissions: readonly string[];
  rapEnabled: boolean;
  externalSubmissionEnabled: boolean;
}

export interface RapAuthorizationRequest {
  operation: RapOperation;
  tenantId: string;
  facilityId: string;
  /** Required for high-impact operations; must come from persisted server state. */
  approval?: {
    approvedBy: string;
    requestedBy: string;
    payloadHash: string;
    expectedPayloadHash: string;
    expiresAt: string;
    used: boolean;
  };
  now?: string;
}

export type RapAuthorizationDecision =
  | { allowed: true; permission: string }
  | {
      allowed: false;
      reason:
        | "FEATURE_DISABLED"
        | "NOT_AUTHENTICATED"
        | "USER_INACTIVE"
        | "TENANT_ACCESS_DENIED"
        | "FACILITY_ACCESS_DENIED"
        | "PERMISSION_DENIED"
        | "SUBMISSION_DISABLED"
        | "APPROVAL_REQUIRED"
        | "APPROVAL_INVALID"
        | "SEPARATION_OF_DUTIES";
    };

const PERMISSION_BY_OPERATION: Readonly<Record<RapOperation, string>> = {
  READ: "rap.read",
  ANALYZE: "rap.analyze",
  DRAFT: "rap.draft",
  APPROVE: "rap.approve",
  EXPORT: "rap.export",
  SUBMIT: "rap.submit",
  MANAGE_KNOWLEDGE_BASE: "rap.knowledge_base.manage",
  DELETE: "rap.delete",
};

const APPROVAL_REQUIRED = new Set<RapOperation>([
  "APPROVE",
  "EXPORT",
  "SUBMIT",
  "MANAGE_KNOWLEDGE_BASE",
  "DELETE",
]);

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * Deny-by-default authorization. Caller must separately enforce database RLS,
 * record-level access, and single-use approval consumption atomically.
 */
export function authorizeRapOperation(
  context: RapAuthorizationContext,
  request: RapAuthorizationRequest,
): RapAuthorizationDecision {
  if (!context.rapEnabled) return { allowed: false, reason: "FEATURE_DISABLED" };
  if (!context.authenticated || !nonEmpty(context.userId)) {
    return { allowed: false, reason: "NOT_AUTHENTICATED" };
  }
  if (!context.activeUser) return { allowed: false, reason: "USER_INACTIVE" };
  if (!context.tenantMembershipVerified || !nonEmpty(context.tenantId)
    || request.tenantId !== context.tenantId) {
    return { allowed: false, reason: "TENANT_ACCESS_DENIED" };
  }
  if (!context.facilityMembershipVerified || !nonEmpty(context.facilityId)
    || request.facilityId !== context.facilityId) {
    return { allowed: false, reason: "FACILITY_ACCESS_DENIED" };
  }

  const permission = PERMISSION_BY_OPERATION[request.operation];
  if (!context.grantedPermissions.includes(permission)) {
    return { allowed: false, reason: "PERMISSION_DENIED" };
  }
  if (request.operation === "SUBMIT" && !context.externalSubmissionEnabled) {
    return { allowed: false, reason: "SUBMISSION_DISABLED" };
  }

  if (APPROVAL_REQUIRED.has(request.operation)) {
    const approval = request.approval;
    if (!approval) return { allowed: false, reason: "APPROVAL_REQUIRED" };
    if (approval.approvedBy === context.userId
      || approval.requestedBy === approval.approvedBy) {
      return { allowed: false, reason: "SEPARATION_OF_DUTIES" };
    }

    const now = Date.parse(request.now ?? new Date().toISOString());
    const expiry = Date.parse(approval.expiresAt);
    if (approval.used || !nonEmpty(approval.payloadHash)
      || approval.payloadHash !== approval.expectedPayloadHash
      || !Number.isFinite(expiry) || !Number.isFinite(now) || expiry <= now
      || !nonEmpty(approval.approvedBy) || !nonEmpty(approval.requestedBy)) {
      return { allowed: false, reason: "APPROVAL_INVALID" };
    }
  }

  return { allowed: true, permission };
}
