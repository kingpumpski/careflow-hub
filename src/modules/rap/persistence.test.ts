import { describe, expect, it } from "vitest";
import { validateConsumeRapApprovalCommand, validateRapAuditEventInput, type ConsumeRapApprovalCommand, type RapAuditEventInput } from "./persistence";

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


const consumeCommand = (
  overrides: Partial<ConsumeRapApprovalCommand> = {},
): ConsumeRapApprovalCommand => ({
  tenantId: "tenant-a",
  facilityId: "facility-a",
  approvalId: "approval-a",
  actorUserId: "reviewer-a",
  expectedPayloadHash: "a".repeat(64),
  now: "2026-10-09T12:00:00.000Z",
  idempotencyKey: "rap-operation-001",
  ...overrides,
});

describe("RAP approval consumption command guard", () => {
  it("accepts a well-formed command with a SHA-256 payload digest", () => {
    expect(validateConsumeRapApprovalCommand(consumeCommand())).toBe(true);
  });

  it("rejects missing scope, identity, operation key, and invalid timestamp", () => {
    expect(validateConsumeRapApprovalCommand(consumeCommand({ tenantId: "" }))).toBe(false);
    expect(validateConsumeRapApprovalCommand(consumeCommand({ facilityId: " " }))).toBe(false);
    expect(validateConsumeRapApprovalCommand(consumeCommand({ actorUserId: "" }))).toBe(false);
    expect(validateConsumeRapApprovalCommand(consumeCommand({ now: "tomorrow" }))).toBe(false);
    expect(validateConsumeRapApprovalCommand(consumeCommand({ idempotencyKey: "short" }))).toBe(false);
    expect(validateConsumeRapApprovalCommand(consumeCommand({ idempotencyKey: "k".repeat(201) }))).toBe(false);
  });

  it("rejects non-SHA-256 or malformed runtime payload hashes", () => {
    expect(validateConsumeRapApprovalCommand(consumeCommand({ expectedPayloadHash: "sha256:abc" }))).toBe(false);
    expect(validateConsumeRapApprovalCommand(consumeCommand({ expectedPayloadHash: "g".repeat(64) }))).toBe(false);
    expect(validateConsumeRapApprovalCommand(null as never)).toBe(false);
  });
});
