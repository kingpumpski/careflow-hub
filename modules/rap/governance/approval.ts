import { createHash, timingSafeEqual } from "node:crypto";

export interface RapApprovalClaims {
  userId: string;
  action: string;
  payloadHash: string;
  expiresAt: string;
  tokenId: string;
}

export interface RapApprovalStore {
  consume(tokenId: string): Promise<boolean>;
}

export interface RapApprovalAudit {
  rejected: (event: { userId: string; action: string; tokenId?: string; reason: string }) => Promise<void>;
}

export function hashApprovalPayload(payload: unknown): string {
  return createHash("sha256").update(stableSerialize(payload)).digest("hex");
}

export function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`);
  return `{${entries.join(",")}}`;
}

export function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function requireApproval(
  claims: RapApprovalClaims | null | undefined,
  expected: { userId: string; action: string; payload: unknown },
  store: RapApprovalStore,
  audit: RapApprovalAudit,
  now = new Date(),
): Promise<void> {
  if (!claims) {
    await audit.rejected({ userId: expected.userId, action: expected.action, reason: "MISSING_APPROVAL_TOKEN" });
    throw new Error("RAP mutation requires an approval token.");
  }

  const expectedPayloadHash = hashApprovalPayload(expected.payload);
  const expired = new Date(claims.expiresAt).getTime() <= now.getTime();
  const valid =
    constantTimeEqual(claims.userId, expected.userId) &&
    constantTimeEqual(claims.action, expected.action) &&
    constantTimeEqual(claims.payloadHash, expectedPayloadHash) &&
    !Number.isNaN(new Date(claims.expiresAt).getTime()) &&
    !expired;

  if (!valid) {
    await audit.rejected({ userId: expected.userId, action: expected.action, tokenId: claims.tokenId, reason: "INVALID_APPROVAL_TOKEN" });
    throw new Error("RAP approval token is invalid or expired.");
  }

  const consumed = await store.consume(claims.tokenId);
  if (!consumed) {
    await audit.rejected({ userId: expected.userId, action: expected.action, tokenId: claims.tokenId, reason: "REPLAYED_APPROVAL_TOKEN" });
    throw new Error("RAP approval token has already been consumed.");
  }
}
