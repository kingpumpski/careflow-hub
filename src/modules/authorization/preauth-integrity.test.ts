import { describe, expect, it } from "vitest";
import { buildPreAuthDocumentPayload, type PreAuthReviewInput } from "./preauth-review";
import { assertPreAuthSnapshotMatchesReviewInput, frozenSnapshotItems } from "./preauth-integrity";

const input = (): PreAuthReviewInput => ({
  patientId: "patient-1",
  patientName: "Ama Mensah",
  membershipNumber: "ABC123",
  insurerId: "insurer-1",
  insurerName: "Example Health Insurance",
  procedureId: "procedure-1",
  procedureName: "Caesarean Section",
  procedureDate: "2026-09-15",
  diagnosis: "O82",
  doctorName: "Dr. Mensah",
  patientPhone: "+233240000000",
  companyName: "Example Company",
  insurerEmail: "authorizations@example.com",
  providerEmail: "claims@provider.example",
  currency: "GH¢",
  format: "ghana",
  items: [{ id: "ui-1", category: "procedure", description: "Caesarean Section", quantity: 1, unitPrice: 4500 }],
});

describe("pre-authorization frozen revision integrity", () => {
  it("accepts an unchanged editable state", () => {
    const snapshot = buildPreAuthDocumentPayload(input(), "PA-2026-ABC12345");
    expect(() => assertPreAuthSnapshotMatchesReviewInput(snapshot, input())).not.toThrow();
  });

  it("rejects edits after a revision has been frozen", () => {
    const frozen = input();
    const snapshot = buildPreAuthDocumentPayload(frozen, "PA-2026-ABC12345");
    const edited = input();
    edited.items[0].unitPrice = 5000;

    expect(() => assertPreAuthSnapshotMatchesReviewInput(snapshot, edited)).toThrow(/no longer matches the frozen revision/);
  });

  it("reconstructs renderer rows without UI identifiers", () => {
    const snapshot = buildPreAuthDocumentPayload(input(), "PA-2026-ABC12345");
    expect(frozenSnapshotItems(snapshot)).toEqual([
      {
        id: "frozen-1",
        category: "procedure",
        description: "Caesarean Section",
        quantity: 1,
        unitPrice: 4500,
      },
    ]);
  });
});
