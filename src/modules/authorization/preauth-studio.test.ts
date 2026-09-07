import { describe, expect, it } from "vitest";
import { buildDuplicateSignature, buildPreAuthEmail, buildRequestNumber, isFutureOrTodayProcedure, itemAmount, totalItems } from "@/modules/authorization/preauth-studio";

describe("pre-authorization studio", () => {
  it("classifies today and future procedures as pending/future", () => {
    const today = new Date(2026, 8, 7);
    expect(isFutureOrTodayProcedure("2026-09-07", today)).toBe(true);
    expect(isFutureOrTodayProcedure("2026-09-08", today)).toBe(true);
    expect(isFutureOrTodayProcedure("2026-09-06", today)).toBe(false);
  });

  it("calculates charge lines and totals", () => {
    expect(itemAmount({ quantity: 3, unitPrice: 125.5 })).toBe(376.5);
    expect(totalItems([
      { id: "1", category: "procedure", description: "A", quantity: 2, unitPrice: 100 },
      { id: "2", category: "drugs", description: "B", quantity: 1, unitPrice: 50 },
    ])).toBe(250);
  });

  it("builds a stable uniqueness signature", () => {
    const a = buildDuplicateSignature({ patientId: "p1", membershipNumber: "abc-123", procedureId: "proc1", procedureDate: "2026-09-07", insurerId: "ins1" });
    const b = buildDuplicateSignature({ patientId: "p1", membershipNumber: " ABC-123 ", procedureId: "proc1", procedureDate: "2026-09-07", insurerId: "ins1" });
    expect(a).toBe(b);
  });

  it("generates a human request number from a UUID", () => {
    expect(buildRequestNumber("12345678-abcd-efgh", new Date(2026, 0, 1))).toBe("PA-2026-12345678");
  });

  it("uses future wording for scheduled procedures", () => {
    const draft = buildPreAuthEmail({ patientName: "Ama Mensah", membershipNumber: "MEM-01", procedureName: "MRI", procedureDate: "2026-09-10", insurerName: "Example Health", providerName: "CareFlow Hospital" }, new Date(2026, 8, 7));
    expect(draft.isFutureProcedure).toBe(true);
    expect(draft.body).toContain("is scheduled to undergo");
    expect(draft.subject).toContain("PRE-AUTHORIZATION REQUEST");
  });

  it("uses past-tense wording for completed procedures", () => {
    const draft = buildPreAuthEmail({ patientName: "Ama Mensah", membershipNumber: "MEM-01", procedureName: "MRI", procedureDate: "2026-09-05", insurerName: "Example Health", providerName: "CareFlow Hospital" }, new Date(2026, 8, 7));
    expect(draft.isFutureProcedure).toBe(false);
    expect(draft.body).toContain("underwent the MRI procedure");
    expect(draft.subject).toContain("POST-PROCEDURE");
  });
});
