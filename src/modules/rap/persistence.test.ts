import { describe, expect, it } from "vitest";
import { validateRapAuditEventInput, type RapAuditEventInput } from "./persistence";

const event = (overrides: Partial<RapAuditEventInput> = {}): RapAuditEventInput => ({
  tenantId: "tenant-a",
  facilityId: "facility-a",
  actorUserId: "user-a",
  action: "ASSESSMENT_VALIDATED",
  resourceType: "assessment",
  resourceId: "assessment-opaque-id",
  occurredAt: "2026-10-09T12:00:00.000Z",
  correlationId: "correlation-a",
  metadata: {
    payloadHash: "sha256:abc",
    assessmentVersion: 3,
    ruleSetVersion: "1.0.0",
  },
  ...overrides,
});

describe("RAP persistence audit contract", () => {
  it("accepts scoped audit metadata using allow-listed keys", () => {
    expect(validateRapAuditEventInput(event())).toBe(true);
  });

  it("rejects missing scope, identity, resource, or invalid timestamp", () => {
    expect(validateRapAuditEventInput(event({ tenantId: " " }))).toBe(false);
    expect(validateRapAuditEventInput(event({ facilityId: "" }))).toBe(false);
    expect(validateRapAuditEventInput(event({ actorUserId: "" }))).toBe(false);
    expect(validateRapAuditEventInput(event({ resourceId: "" }))).toBe(false);
    expect(validateRapAuditEventInput(event({ occurredAt: "not-a-date" }))).toBe(false);
    expect(validateRapAuditEventInput(event({ correlationId: "" }))).toBe(false);
  });

  it("fails closed for malformed runtime metadata, enum values, and non-finite numbers", () => {
    expect(validateRapAuditEventInput(event({ metadata: null as never }))).toBe(false);
    expect(validateRapAuditEventInput(event({ metadata: [] as never }))).toBe(false);
    expect(validateRapAuditEventInput(event({ metadata: { assessmentVersion: Number.NaN } }))).toBe(false);
    expect(validateRapAuditEventInput(event({ action: "EXECUTE_SQL" as never }))).toBe(false);
    expect(validateRapAuditEventInput(event({ resourceType: "patient" as never }))).toBe(false);
    expect(validateRapAuditEventInput(null as never)).toBe(false);
  });

  it("rejects arbitrary metadata keys that could leak clinical or claim text", () => {
    expect(validateRapAuditEventInput(event({
      metadata: { diagnosis: "free text diagnosis" },
    }))).toBe(false);
    expect(validateRapAuditEventInput(event({
      metadata: { payloadHash: "x".repeat(257) },
    }))).toBe(false);
  });
});
