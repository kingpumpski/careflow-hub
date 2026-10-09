import { describe, expect, it, vi } from "vitest";
import { hashApprovalPayload, requireSignedApproval, signApprovalToken, verifyApprovalToken } from "./approval";

describe("RAP approval boundary", () => {
  it("binds approval to the canonical payload", () => {
    expect(hashApprovalPayload({ b: 2, a: 1 })).toBe(hashApprovalPayload({ a: 1, b: 2 }));
  });

  it("rejects missing approval and audits it", async () => {
    const audit = { rejected: vi.fn().mockResolvedValue(undefined) };
    const store = { consume: vi.fn() };
    await expect(requireSignedApproval(null, "test-only-secret-with-at-least-32-bytes", { userId: "11111111-1111-4111-8111-111111111111", action: "export", payload: { id: 1 } }, store, audit)).rejects.toThrow("approval token");
    expect(audit.rejected).toHaveBeenCalledWith(expect.objectContaining({ reason: "MISSING_APPROVAL_TOKEN" }));
  });

  it("rejects an expired token", async () => {
    const audit = { rejected: vi.fn().mockResolvedValue(undefined) };
    const store = { consume: vi.fn() };
    const claims = { userId: "11111111-1111-4111-8111-111111111111", action: "export", payloadHash: hashApprovalPayload({ id: 1 }), expiresAt: "2020-01-01T00:00:00Z", tokenId: "22222222-2222-4222-8222-222222222222" };
    await expect(requireSignedApproval(signApprovalToken(claims, "test-only-secret-with-at-least-32-bytes"), "test-only-secret-with-at-least-32-bytes", { userId: "11111111-1111-4111-8111-111111111111", action: "export", payload: { id: 1 } }, store, audit, new Date("2021-01-01T00:00:00Z"))).rejects.toThrow("invalid or expired");
    expect(store.consume).not.toHaveBeenCalled();
  });

  it("signs and verifies approval claims with a server-side secret", () => {
    const secret = "test-only-secret-with-at-least-32-bytes";
    const claims = { userId: "11111111-1111-4111-8111-111111111111", action: "export", payloadHash: hashApprovalPayload({ id: 1 }), expiresAt: "2030-01-01T00:00:00Z", tokenId: "22222222-2222-4222-8222-222222222222" };
    expect(verifyApprovalToken(signApprovalToken(claims, secret), secret)).toEqual(claims);
    expect(() => signApprovalToken(claims, "short")).toThrow(/32 UTF-8 bytes/i);
  });

  it("rejects a tampered signature before consuming a token", async () => {
    const secret = "test-only-secret-with-at-least-32-bytes";
    const claims = { userId: "11111111-1111-4111-8111-111111111111", action: "export", payloadHash: hashApprovalPayload({ id: 1 }), expiresAt: "2030-01-01T00:00:00Z", tokenId: "22222222-2222-4222-8222-222222222222" };
    const token = signApprovalToken(claims, secret);
    const audit = { rejected: vi.fn().mockResolvedValue(undefined) };
    const store = { consume: vi.fn().mockResolvedValue(true) };
    await expect(requireSignedApproval(`${token.slice(0, -1)}x`, secret, { userId: "11111111-1111-4111-8111-111111111111", action: "export", payload: { id: 1 } }, store, audit, new Date("2029-01-01T00:00:00Z"))).rejects.toThrow(/signature/i);
    expect(store.consume).not.toHaveBeenCalled();
    expect(audit.rejected).toHaveBeenCalledWith(expect.objectContaining({ reason: "INVALID_APPROVAL_SIGNATURE" }));
  });

  it("consumes a valid signed approval only after verifying signature and payload binding", async () => {
    const secret = "test-only-secret-with-at-least-32-bytes";
    const payload = { id: 1 };
    const token = signApprovalToken({ userId: "11111111-1111-4111-8111-111111111111", action: "export", payloadHash: hashApprovalPayload(payload), expiresAt: "2030-01-01T00:00:00Z", tokenId: "22222222-2222-4222-8222-222222222222" }, secret);
    const audit = { rejected: vi.fn().mockResolvedValue(undefined) };
    const store = { consume: vi.fn().mockResolvedValue(true) };
    await expect(requireSignedApproval(token, secret, { userId: "11111111-1111-4111-8111-111111111111", action: "export", payload }, store, audit, new Date("2029-01-01T00:00:00Z"))).resolves.toBeUndefined();
    expect(store.consume).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222");
  });
});
