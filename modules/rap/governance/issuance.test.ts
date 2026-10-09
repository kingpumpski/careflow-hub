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
    insertIssuedToken: vi.fn().mockResolvedValue(undefined),
    auditIssued: vi.fn().mockResolvedValue(undefined),
  };
}

describe("RAP approval issuance", () => {
  it("authorizes, persists and audits before returning a short-lived signed token", async () => {
    const deps = dependencies();
    const now = new Date("2026-01-01T00:00:00.000Z");
    const result = await issueRapApprovalToken({
      requesterId, approverId, facilityId, action: "export",
      payload: { adviceId: "advice-1", column: "diagnosis" }, ttlMinutes: 15, now,
    }, secret, deps);

    expect(deps.canApprove).toHaveBeenCalledWith({ approverId, requesterId, facilityId, action: "export" });
    expect(deps.insertIssuedToken).toHaveBeenCalledTimes(1);
    expect(deps.auditIssued).toHaveBeenCalledTimes(1);
    expect(deps.insertIssuedToken.mock.invocationCallOrder[0]).toBeLessThan(deps.auditIssued.mock.invocationCallOrder[0]);
    expect(verifyApprovalToken(result.token, secret)).toMatchObject({
      userId: requesterId,
      action: "export",
      expiresAt: "2026-01-01T00:15:00.000Z",
      payloadHash: result.claims.payloadHash,
      tokenId: result.claims.tokenId,
    });
    expect(deps.insertIssuedToken).toHaveBeenCalledWith(expect.objectContaining({
      id: result.claims.tokenId,
      requestedBy: requesterId,
      approvedBy: approverId,
      facilityId,
    }));
  });

  it("fails closed when the host denies approval", async () => {
    const deps = dependencies(false);
    await expect(issueRapApprovalToken({
      requesterId, approverId, facilityId, action: "export", payload: {}, ttlMinutes: 5,
    }, secret, deps)).rejects.toThrow(/not authorized/i);
    expect(deps.insertIssuedToken).not.toHaveBeenCalled();
    expect(deps.auditIssued).not.toHaveBeenCalled();
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

  it("rejects a misconfigured signing secret before creating a database row", async () => {
    const deps = dependencies();
    await expect(issueRapApprovalToken({
      requesterId, approverId, facilityId, action: "export", payload: {}, ttlMinutes: 5,
    }, "short", deps)).rejects.toThrow(/32 UTF-8 bytes/i);
    expect(deps.insertIssuedToken).not.toHaveBeenCalled();
  });

  it("does not return a token if persistence or audit fails", async () => {
    const persistenceFailure = dependencies();
    persistenceFailure.insertIssuedToken.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(issueRapApprovalToken({
      requesterId, approverId, facilityId, action: "export", payload: {}, ttlMinutes: 5,
    }, secret, persistenceFailure)).rejects.toThrow(/database unavailable/);
    expect(persistenceFailure.auditIssued).not.toHaveBeenCalled();

    const auditFailure = dependencies();
    auditFailure.auditIssued.mockRejectedValueOnce(new Error("audit unavailable"));
    await expect(issueRapApprovalToken({
      requesterId, approverId, facilityId, action: "export", payload: {}, ttlMinutes: 5,
    }, secret, auditFailure)).rejects.toThrow(/audit unavailable/);
  });
});
