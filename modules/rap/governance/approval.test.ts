import { describe, expect, it, vi } from "vitest";
import { hashApprovalPayload, requireApproval } from "./approval";

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
});
