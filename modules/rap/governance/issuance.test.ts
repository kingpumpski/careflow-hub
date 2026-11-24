import { describe, expect, it, vi } from "vitest";
import { verifyApprovalToken } from "./approval";
import { issueRapApprovalToken } from "./issuance";

const requesterId = "11111111-1111-4111-8111-111111111111";
const approverId = "22222222-2222-4222-8222-222222222222";
const facilityId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const secret = "test-only-secret-with-at-least-32-bytes";

function dependencies(authorized = true) {
  return {
    canApprove: vi.fn().mockResolvedValue(authorized),
    persistIssuedTokenAndAuditAtomically: vi.fn().mockResolvedValue(undefined),
  };
}

describe("RAP approval issuance", () => {
  it("authorizes and atomically persists token plus audit before returning a short-lived signed token", async () => {
    const deps = dependencies();
    const now = new Date("2026-01-01T00:00:00.000Z");
    const result = await issueRapApprovalToken({
      requesterId, approverId, facilityId, action: "export",
      payload: { adviceId: "advice-1", column: "diagnosis" }, ttlMinutes: 15, now,
    }, secret, deps);

    expect(deps.canApprove).toHaveBeenCalledWith({ approverId, requesterId, facilityId, action: "export" });
    expect(deps.persistIssuedTokenAndAuditAtomically).toHaveBeenCalledTimes(1);
    const persisted = deps.persistIssuedTokenAndAuditAtomically.mock.calls[0][0];
    expect(persisted.token).toMatchObject({
      id: result.claims.tokenId,
      requestedBy: requesterId,
      approvedBy: approverId,
      facilityId,
      status: "ISSUED",
    });
    expect(persisted.audit).toMatchObject({
      tokenId: result.claims.tokenId,
      requesterId,
      approverId,
      facilityId,
      action: "export",
      payloadHash: result.claims.payloadHash,
    });
    expect(verifyApprovalToken(result.token, secret)).toMatchObject({
      userId: requesterId,
      action: "export",
      expiresAt: "2026-01-01T00:15:00.000Z",
      payloadHash: result.claims.payloadHash,
      tokenId: result.claims.tokenId,
    });
  });

  it("fails closed when the host denies approval", async () => {
    const deps = dependencies(false);
    await expect(issueRapApprovalToken({
      requesterId, approverId, facilityId, action: "export", payload: {}, ttlMinutes: 5,
    }, secret, deps)).rejects.toThrow(/not authorized/i);
    expect(deps.persistIssuedTokenAndAuditAtomically).not.toHaveBeenCalled();
  });

  it("enforces separation of duties and bounded TTL", async () => {
    const deps = dependencies();
    await expect(issueRapApprovalToken({
      requesterId, approverId: requesterId, facilityId, action: "export", payload: {}, ttlMinutes: 5,
    }, secret, deps)).rejects.toThrow(/different approver/i);
    await expect(issueRapApprovalToken({
      requesterId, approverId, facilityId, action: "export", payload: {}, ttlMinutes: 16,
    }, secret, deps)).rejects.toThrow(/TTL/i);
    expect(deps.canApprove).not.toHaveBeenCalled();
  });

  it("rejects a misconfigured signing secret before persistence", async () => {
    const deps = dependencies();
    await expect(issueRapApprovalToken({
      requesterId, approverId, facilityId, action: "export", payload: {}, ttlMinutes: 5,
    }, "short", deps)).rejects.toThrow(/32 UTF-8 bytes/i);
    expect(deps.persistIssuedTokenAndAuditAtomically).not.toHaveBeenCalled();
  });

  it("does not return a token when the atomic token-and-audit transaction fails", async () => {
    const deps = dependencies();
    deps.persistIssuedTokenAndAuditAtomically.mockRejectedValueOnce(new Error("transaction rolled back"));
    await expect(issueRapApprovalToken({
      requesterId, approverId, facilityId, action: "export", payload: {}, ttlMinutes: 5,
    }, secret, deps)).rejects.toThrow(/transaction rolled back/);
    expect(deps.persistIssuedTokenAndAuditAtomically).toHaveBeenCalledTimes(1);
  });
});
