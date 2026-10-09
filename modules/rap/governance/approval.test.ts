import { describe, expect, it, vi } from "vitest";
import { hashApprovalPayload, requireApproval, requireSignedApproval, signApprovalToken, verifyApprovalToken } from "./approval";

describe("RAP approval boundary", () => {
  it("binds approval to the canonical payload", () => {
    expect(hashApprovalPayload({ b: 2, a: 1 })).toBe(hashApprovalPayload({ a: 1, b: 2 }));
  });

  it("rejects missing approval and audits it", async () => {
    const audit = { rejected: vi.fn().mockResolvedValue(undefined) };
    const store = { consume: vi.fn() };
    await expect(requireApproval(null, { userId: "u1", action: "export", payload: { id: 1 } }, store, audit)).rejects.toThrow("approval token");
    expect(audit.rejected).toHaveBeenCalledWith(expect.objectContaining({ reason: "MISSING_APPROVAL_TOKEN" }));
  });

  it("rejects an expired token", async () => {
    const audit = { rejected: vi.fn().mockResolvedValue(undefined) };
    const store = { consume: vi.fn() };
    const claims = { userId: "u1", action: "export", payloadHash: hashApprovalPayload({ id: 1 }), expiresAt: "2020-01-01T00:00:00Z", tokenId: "t1" };
    await expect(requireApproval(claims, { userId: "u1", action: "export", payload: { id: 1 } }, store, audit)).rejects.toThrow("invalid or expired");
    expect(store.consume).not.toHaveBeenCalled();
  });

  it("signs and verifies approval claims with a server-side secret", () => {
    const secret = "test-only-secret-with-at-least-32-bytes";
    const claims = { userId: "u1", action: "export", payloadHash: hashApprovalPayload({ id: 1 }), expiresAt: "2030-01-01T00:00:00Z", tokenId: "t1" };
    expect(verifyApprovalToken(signApprovalToken(claims, secret), secret)).toEqual(claims);
    expect(() => signApprovalToken(claims, "short")).toThrow(/32 UTF-8 bytes/i);
  });

  it("rejects a tampered signature before consuming a token", async () => {
    const secret = "test-only-secret-with-at-least-32-bytes";
    const claims = { userId: "u1", action: "export", payloadHash: hashApprovalPayload({ id: 1 }), expiresAt: "2030-01-01T00:00:00Z", tokenId: "t1" };
    const token = signApprovalToken(claims, secret);
    const audit = { rejected: vi.fn().mockResolvedValue(undefined) };
    const store = { consume: vi.fn().mockResolvedValue(true) };
    await expect(requireSignedApproval(`${token.slice(0, -1)}x`, secret, { userId: "u1", action: "export", payload: { id: 1 } }, store, audit, new Date("2029-01-01T00:00:00Z"))).rejects.toThrow(/signature/i);
    expect(store.consume).not.toHaveBeenCalled();
    expect(audit.rejected).toHaveBeenCalledWith(expect.objectContaining({ reason: "INVALID_APPROVAL_SIGNATURE" }));
  });

  it("consumes a valid signed approval only after verifying signature and payload binding", async () => {
    const secret = "test-only-secret-with-at-least-32-bytes";
    const payload = { id: 1 };
    const token = signApprovalToken({ userId: "u1", action: "export", payloadHash: hashApprovalPayload(payload), expiresAt: "2030-01-01T00:00:00Z", tokenId: "t1" }, secret);
    const audit = { rejected: vi.fn().mockResolvedValue(undefined) };
    const store = { consume: vi.fn().mockResolvedValue(true) };
    await expect(requireSignedApproval(token, secret, { userId: "u1", action: "export", payload }, store, audit, new Date("2029-01-01T00:00:00Z"))).resolves.toBeUndefined();
    expect(store.consume).toHaveBeenCalledWith("t1");
  });
});
