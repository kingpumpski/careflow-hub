import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export interface RapApprovalClaims {
  userId: string;
  action: string;
  payloadHash: string;
  expiresAt: string;
  tokenId: string;
}

export interface RapApprovalStore {
  consume(input: { tokenId: string; actorId: string; action: string; payloadHash: string }): Promise<boolean>;
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

const MIN_APPROVAL_SECRET_BYTES = 32;

function assertApprovalSecret(secret: string): void {
  if (Buffer.byteLength(secret, "utf8") < MIN_APPROVAL_SECRET_BYTES) {
    throw new Error("RAP approval signing secret must contain at least 32 UTF-8 bytes.");
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isApprovalClaims(value: unknown): value is RapApprovalClaims {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const claims = value as Record<string, unknown>;
  return (
    typeof claims.userId === "string" && UUID_PATTERN.test(claims.userId) &&
    typeof claims.action === "string" && claims.action.length > 0 &&
    typeof claims.payloadHash === "string" && /^[a-f0-9]{64}$/i.test(claims.payloadHash) &&
    typeof claims.expiresAt === "string" && Number.isFinite(Date.parse(claims.expiresAt)) &&
    typeof claims.tokenId === "string" && UUID_PATTERN.test(claims.tokenId)
  );
}

/** Sign claims for transport; the secret must be server-only and never shipped to a client. */
export function signApprovalToken(claims: RapApprovalClaims, secret: string): string {
  assertApprovalSecret(secret);
  if (!isApprovalClaims(claims)) throw new Error("RAP approval claims are malformed.");
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

/** Verify token integrity before any claims are trusted or the single-use store is touched. */
export function verifyApprovalToken(token: string, secret: string): RapApprovalClaims {
  assertApprovalSecret(secret);
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("RAP approval token is malformed.");
  }
  const expectedSignature = createHmac("sha256", secret).update(parts[0]).digest("base64url");
  if (!constantTimeEqual(parts[1], expectedSignature)) {
    throw new Error("RAP approval token signature is invalid.");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    throw new Error("RAP approval token payload is malformed.");
  }
  if (!isApprovalClaims(decoded)) throw new Error("RAP approval token claims are malformed.");
  return decoded;
}

/** Preferred entry point for request handlers: authenticate signature, then enforce binding and atomic consumption. */
export async function requireSignedApproval(
  token: string | null | undefined,
  secret: string,
  expected: { userId: string; action: string; payload: unknown },
  store: RapApprovalStore,
  audit: RapApprovalAudit,
  now = new Date(),
): Promise<void> {
  if (!token) {
    await enforceApprovalClaims(null, expected, store, audit, now);
    return;
  }
  let claims: RapApprovalClaims;
  try {
    claims = verifyApprovalToken(token, secret);
  } catch {
    await audit.rejected({ userId: expected.userId, action: expected.action, reason: "INVALID_APPROVAL_SIGNATURE" });
    throw new Error("RAP approval token signature is invalid.");
  }
  await enforceApprovalClaims(claims, expected, store, audit, now);
}

async function enforceApprovalClaims(
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

  const consumed = await store.consume({ tokenId: claims.tokenId, actorId: claims.userId, action: claims.action, payloadHash: claims.payloadHash });
  if (!consumed) {
    await audit.rejected({ userId: expected.userId, action: expected.action, tokenId: claims.tokenId, reason: "REPLAYED_APPROVAL_TOKEN" });
    throw new Error("RAP approval token has already been consumed.");
  }
}
