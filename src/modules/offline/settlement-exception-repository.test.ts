import { describe, expect, it } from "vitest";
import { buildCreatedSettlementExceptionAuditEvent } from "./settlement-exception-repository";

const exception = {
  facilityId: "facility-1",
  settlementPeriodId: "period-1",
  type: "payment_variance" as const,
  severity: "warning" as const,
  status: "open" as const,
  title: "Approved claims under-settlement detected",
  description: "Approved gross less actual WHT and net cash leaves GHC 5.00.",
  detectedAt: "2026-11-25T12:00:00.000Z",
  assignedTo: null,
  resolutionNote: null,
  resolvedAt: null,
  resolvedBy: null,
};

describe("offline settlement exception creation audit", () => {
  it("records the authenticated actor on the immutable created event", () => {
    const event = buildCreatedSettlementExceptionAuditEvent(exception, "exception-1", "user-123", "audit-1");

    expect(event).toMatchObject({
      id: "audit-1",
      facilityId: "facility-1",
      exceptionId: "exception-1",
      eventType: "created",
      actorId: "user-123",
      occurredAt: exception.detectedAt,
      before: null,
      after: "open",
    });
  });

  it("keeps the actor explicitly null when no authenticated identity is available", () => {
    const event = buildCreatedSettlementExceptionAuditEvent(exception, "exception-1", null, "audit-2");
    expect(event.actorId).toBeNull();
  });
});
