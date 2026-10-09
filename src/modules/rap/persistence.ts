/**
 * RAP persistence ports.
 *
 * These interfaces define the contract an authenticated server adapter must
 * implement. They deliberately contain no Supabase client and cannot be used
 * as proof that a database operation is atomic or append-only. The adapter
 * must enforce these guarantees in a database transaction/RPC and under RLS.
 */

export interface RapScope {
  /** Derived from verified server-side membership, never trusted request JSON. */
  tenantId: string;
  facilityId: string;
}

export interface RapApprovalRecord extends RapScope {
  id: string;
  requestedBy: string;
  approvedBy: string;
  payloadHash: string;
  expiresAt: string;
  consumedAt: string | null;
  consumedBy: string | null;
  version: number;
}

export interface ConsumeRapApprovalCommand extends RapScope {
  approvalId: string;
  actorUserId: string;
  expectedPayloadHash: string;
  now: string;
  /** Unique operation key makes safe retries idempotent. */
  idempotencyKey: string;
}

export type ConsumeRapApprovalResult =
  | { consumed: true; approval: RapApprovalRecord; replayed: boolean }
  | {
      consumed: false;
      reason:
        | "NOT_FOUND"
        | "SCOPE_MISMATCH"
        | "ALREADY_CONSUMED"
        | "EXPIRED"
        | "PAYLOAD_MISMATCH"
        | "SELF_APPROVAL"
        | "IDEMPOTENCY_CONFLICT";
    };

export type RapAuditAction =
  | "ASSESSMENT_CREATED"
  | "ASSESSMENT_VALIDATED"
  | "APPROVAL_GRANTED"
  | "APPROVAL_CONSUMED"
  | "EXPORT_REQUESTED"
  | "SUBMISSION_REQUESTED"
  | "ACCESS_DENIED";

export interface RapAuditEventInput extends RapScope {
  actorUserId: string;
  action: RapAuditAction;
  resourceType: "assessment" | "approval" | "export" | "submission";
  /** Opaque database identifier only; never patient name, diagnosis or claim text. */
  resourceId: string;
  occurredAt: string;
  correlationId: string;
  /** Hashes/versions only; avoid free-text and clinical payloads. */
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export interface RapAuditEvent extends RapAuditEventInput {
  id: string;
  previousEventHash: string | null;
  eventHash: string;
}

export interface RapPersistencePort {
  /**
   * Must be one atomic database operation: scope check, expiry/hash/creator
   * checks, single-use consumption, and idempotency record commit together.
   * Concurrent callers must not both consume the same approval.
   */
  consumeApproval(command: ConsumeRapApprovalCommand): Promise<ConsumeRapApprovalResult>;

  /**
   * Must append only. Database privileges/policies must deny UPDATE/DELETE;
   * the implementation should link events by hash and record failed attempts.
   */
  appendAuditEvent(event: RapAuditEventInput): Promise<RapAuditEvent>;

  /** Every query must apply both tenant and facility scope at the database boundary. */
  verifyScope(scope: RapScope, actorUserId: string): Promise<boolean>;
}

/**
 * Conservative input guard for audit writes. This does not replace database
 * constraints or validate identity; it rejects empty scope/identity and
 * free-form metadata keys that could accidentally carry clinical text.
 */
export function validateRapAuditEventInput(input: RapAuditEventInput): boolean {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;

  const candidate = input as unknown as Record<string, unknown>;
  const requiredText = [
    "tenantId",
    "facilityId",
    "actorUserId",
    "resourceId",
    "correlationId",
    "occurredAt",
  ];

  if (requiredText.some((key) => typeof candidate[key] !== "string" || !(candidate[key] as string).trim())) {
    return false;
  }

  const occurredAt = candidate.occurredAt as string;
  if (!Number.isFinite(Date.parse(occurredAt))) return false;

  const allowedActions = new Set<RapAuditAction>([
    "ASSESSMENT_CREATED",
    "ASSESSMENT_VALIDATED",
    "APPROVAL_GRANTED",
    "APPROVAL_CONSUMED",
    "EXPORT_REQUESTED",
    "SUBMISSION_REQUESTED",
    "ACCESS_DENIED",
  ]);
  const allowedResourceTypes = new Set(["assessment", "approval", "export", "submission"]);
  if (!allowedActions.has(candidate.action as RapAuditAction)) return false;
  if (!allowedResourceTypes.has(candidate.resourceType as string)) return false;

  const metadata = candidate.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const prototype = Object.getPrototypeOf(metadata);
  if (prototype !== Object.prototype && prototype !== null) return false;

  const allowedMetadataKeys = new Set([
    "payloadHash",
    "assessmentVersion",
    "ruleSetVersion",
    "pipelineVersion",
    "reasonCode",
    "approvalId",
    "idempotencyKey",
  ]);

  return Object.entries(metadata as Record<string, unknown>).every(([key, value]) => {
    if (!allowedMetadataKeys.has(key)) return false;
    if (value !== null && !["string", "number", "boolean"].includes(typeof value)) return false;
    if (typeof value === "number" && !Number.isFinite(value)) return false;
    return typeof value !== "string" || value.length <= 256;
  });
}


/**
 * Validate the shape of a consume command before calling the persistence port.
 * This is defense in depth only: atomic single-use, scope and idempotency
 * guarantees must still be enforced by the database transaction.
 */
export function validateConsumeRapApprovalCommand(
  command: ConsumeRapApprovalCommand,
): boolean {
  if (!command || typeof command !== "object" || Array.isArray(command)) return false;

  const candidate = command as unknown as Record<string, unknown>;
  const requiredText = [
    "tenantId",
    "facilityId",
    "approvalId",
    "actorUserId",
    "expectedPayloadHash",
    "now",
    "idempotencyKey",
  ];

  if (requiredText.some((key) =>
    typeof candidate[key] !== "string" || !(candidate[key] as string).trim()
  )) return false;

  const timestamp = candidate.now as string;
  if (!Number.isFinite(Date.parse(timestamp))) return false;

  const idempotencyKey = candidate.idempotencyKey as string;
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) return false;

  // SHA-256 hex digest only; accepting arbitrary strings weakens payload binding.
  const payloadHash = candidate.expectedPayloadHash as string;
  if (!/^[a-f0-9]{64}$/i.test(payloadHash)) return false;

  return true;
}
