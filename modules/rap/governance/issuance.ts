import { randomUUID } from "node:crypto";
import { hashApprovalPayload, signApprovalToken, type RapApprovalClaims } from "./approval";

export interface RapApprovalIssuanceRecord {
  id: string;
  action: string;
  payloadHash: string;
  requestedBy: string;
  approvedBy: string;
  approvedAt: string;
  expiresAt: string;
  facilityId: string;
  status: "ISSUED";
}

/**
 * Host-owned authorization and persistence are mandatory. The caller must derive
 * all identities/facility scope from its authenticated server session, never
 * from an untrusted request body. This service deliberately has no client route.
 */
export interface RapApprovalIssuanceDependencies {
  canApprove(input: {
    approverId: string;
    requesterId: string;
    facilityId: string;
    action: string;
  }): Promise<boolean>;
  insertIssuedToken(record: RapApprovalIssuanceRecord): Promise<void>;
  auditIssued(record: {
    tokenId: string;
    requesterId: string;
    approverId: string;
    facilityId: string;
    action: string;
    payloadHash: string;
    expiresAt: string;
  }): Promise<void>;
}

export interface RapApprovalIssuanceInput {
  requesterId: string;
  approverId: string;
  facilityId: string;
  action: string;
  payload: unknown;
  ttlMinutes: number;
  now?: Date;
}

/**
 * Issue a signed, single-use approval only after the host confirms that the
 * approver is authorized for this facility/action. Persist before returning the
 * token; if persistence or audit fails, fail closed and do not return a token.
 */
export async function issueRapApprovalToken(
  input: RapApprovalIssuanceInput,
  secret: string,
  dependencies: RapApprovalIssuanceDependencies,
): Promise<{ token: string; claims: RapApprovalClaims }> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(input.requesterId) || !uuid.test(input.approverId) || !uuid.test(input.facilityId)) {
    throw new Error("RAP approval identities and facility must be valid UUIDs.");
  }
  if (input.requesterId === input.approverId) {
    throw new Error("RAP approval requires a different approver from the requester.");
  }
  if (typeof input.action !== "string" || !/^[a-z][a-z0-9:_-]{1,79}$/i.test(input.action)) {
    throw new Error("RAP approval action is invalid.");
  }
  if (!Number.isSafeInteger(input.ttlMinutes) || input.ttlMinutes < 1 || input.ttlMinutes > 15) {
    throw new Error("RAP approval token TTL must be between 1 and 15 whole minutes.");
  }
  const now = input.now ?? new Date();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("RAP approval issuance time must be a valid date.");
  }

  const authorized = await dependencies.canApprove({
    approverId: input.approverId,
    requesterId: input.requesterId,
    facilityId: input.facilityId,
    action: input.action,
  });
  if (!authorized) throw new Error("Approver is not authorized for this RAP action and facility.");

  const tokenId = randomUUID();
  const payloadHash = hashApprovalPayload(input.payload);
  const expiresAt = new Date(now.getTime() + input.ttlMinutes * 60_000).toISOString();
  const claims: RapApprovalClaims = {
    userId: input.requesterId,
    action: input.action,
    payloadHash,
    expiresAt,
    tokenId,
  };
  const record: RapApprovalIssuanceRecord = {
    id: tokenId,
    action: input.action,
    payloadHash,
    requestedBy: input.requesterId,
    approvedBy: input.approverId,
    approvedAt: now.toISOString(),
    expiresAt,
    facilityId: input.facilityId,
    status: "ISSUED",
  };

  // Validate the signing secret and construct the token before creating durable
  // state, so a misconfigured server cannot strand an unusable ISSUED row.
  const token = signApprovalToken(claims, secret);
  await dependencies.insertIssuedToken(record);
  await dependencies.auditIssued({
    tokenId,
    requesterId: input.requesterId,
    approverId: input.approverId,
    facilityId: input.facilityId,
    action: input.action,
    payloadHash,
    expiresAt,
  });

  return { token, claims };
}
