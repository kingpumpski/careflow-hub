import { describe, expect, it } from "vitest";
import {
  authorizeRapOperation,
  type RapAuthorizationContext,
  type RapAuthorizationRequest,
} from "./authorization";

const context = (overrides: Partial<RapAuthorizationContext> = {}): RapAuthorizationContext => ({
  authenticated: true,
  activeUser: true,
  userId: "user-1",
  tenantId: "tenant-1",
  facilityId: "facility-1",
  tenantMembershipVerified: true,
  facilityMembershipVerified: true,
  grantedPermissions: ["rap.read", "rap.analyze", "rap.draft", "rap.approve", "rap.export", "rap.submit"],
  rapEnabled: true,
  externalSubmissionEnabled: false,
  ...overrides,
});

const request = (overrides: Partial<RapAuthorizationRequest> = {}): RapAuthorizationRequest => ({
  operation: "ANALYZE",
  tenantId: "tenant-1",
  facilityId: "facility-1",
  ...overrides,
});

const approval = {
  approvedBy: "reviewer-2",
  requestedBy: "user-1",
  payloadHash: "sha256:abc",
  expectedPayloadHash: "sha256:abc",
  expiresAt: "2030-01-01T00:00:00.000Z",
  used: false,
};

describe("authorizeRapOperation", () => {
  it("denies by default when RAP is disabled", () => {
    expect(authorizeRapOperation(context({ rapEnabled: false }), request()))
      .toEqual({ allowed: false, reason: "FEATURE_DISABLED" });
  });

  it("requires an authenticated, active user", () => {
    expect(authorizeRapOperation(context({ authenticated: false }), request()))
      .toEqual({ allowed: false, reason: "NOT_AUTHENTICATED" });
    expect(authorizeRapOperation(context({ activeUser: false }), request()))
      .toEqual({ allowed: false, reason: "USER_INACTIVE" });
  });

  it("rejects tenant and facility scope mismatches", () => {
    expect(authorizeRapOperation(context(), request({ tenantId: "other-tenant" })))
      .toEqual({ allowed: false, reason: "TENANT_ACCESS_DENIED" });
    expect(authorizeRapOperation(context(), request({ facilityId: "other-facility" })))
      .toEqual({ allowed: false, reason: "FACILITY_ACCESS_DENIED" });
  });

  it("requires the exact operation permission", () => {
    expect(authorizeRapOperation(context({ grantedPermissions: ["rap.read"] }), request()))
      .toEqual({ allowed: false, reason: "PERMISSION_DENIED" });
  });

  it("keeps external payer submission disabled unless explicitly enabled server-side", () => {
    const submit = request({ operation: "SUBMIT", approval });
    expect(authorizeRapOperation(context({ externalSubmissionEnabled: false }), submit))
      .toEqual({ allowed: false, reason: "SUBMISSION_DISABLED" });
  });

  it("requires an unexpired, unused approval matching the payload hash", () => {
    expect(authorizeRapOperation(context(), request({ operation: "EXPORT" })))
      .toEqual({ allowed: false, reason: "APPROVAL_REQUIRED" });
    expect(authorizeRapOperation(context(), request({
      operation: "EXPORT",
      approval: { ...approval, payloadHash: "sha256:other" },
      now: "2029-01-01T00:00:00.000Z",
    }))).toEqual({ allowed: false, reason: "APPROVAL_INVALID" });
    expect(authorizeRapOperation(context(), request({
      operation: "EXPORT",
      approval: { ...approval, used: true },
      now: "2029-01-01T00:00:00.000Z",
    }))).toEqual({ allowed: false, reason: "APPROVAL_INVALID" });
    expect(authorizeRapOperation(context(), request({
      operation: "EXPORT",
      approval,
      now: "2031-01-01T00:00:00.000Z",
    }))).toEqual({ allowed: false, reason: "APPROVAL_INVALID" });
  });

  it("enforces separation of duties for high-impact operations", () => {
    expect(authorizeRapOperation(context(), request({
      operation: "APPROVE",
      approval: { ...approval, approvedBy: "user-1" },
      now: "2029-01-01T00:00:00.000Z",
    }))).toEqual({ allowed: false, reason: "SEPARATION_OF_DUTIES" });
  });

  it("allows an in-scope read with the matching permission", () => {
    expect(authorizeRapOperation(context(), request()))
      .toEqual({ allowed: true, permission: "rap.analyze" });
  });

  it("allows an approved export when the payload, expiry, and reviewer are valid", () => {
    expect(authorizeRapOperation(context(), request({
      operation: "EXPORT",
      approval,
      now: "2029-01-01T00:00:00.000Z",
    }))).toEqual({ allowed: true, permission: "rap.export" });
  });
});
