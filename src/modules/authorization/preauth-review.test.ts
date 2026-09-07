import { describe, expect, it } from "vitest";
import { buildPreAuthDocumentPayload, validatePreAuthReview, type PreAuthReviewInput } from "./preauth-review";

const baseInput = (): PreAuthReviewInput => ({
  patientId: "patient-1",
  patientName: "Ama Mensah",
  membershipNumber: "ABC123",
  insurerId: "insurer-1",
  insurerName: "Example Health Insurance",
  procedureId: "procedure-1",
  procedureName: "Caesarean Section",
  procedureDate: "2026-09-15",
  diagnosis: "O82 - Encounter for caesarean delivery",
  doctorName: "Dr. Mensah",
  patientPhone: "+233240000000",
  companyName: "Example Company",
  insurerEmail: "authorizations@example.com",
  providerEmail: "claims@provider.example",
  currency: "GH¢",
  format: "ghana",
  items: [{ id: "1", category: "procedure", description: "Caesarean Section", quantity: 1, unitPrice: 4500 }],
});

describe("pre-authorization review", () => {
  it("marks a complete request ready", () => {
    const result = validatePreAuthReview(baseInput());
    expect(result.ready).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.total).toBe(4500);
  });

  it("blocks submission when the insurer email is missing", () => {
    const input = baseInput();
    input.insurerEmail = "";
    const result = validatePreAuthReview(input);
    expect(result.ready).toBe(false);
    expect(result.errors.some((entry) => entry.field === "insurerEmail")).toBe(true);
  });

  it("blocks zero-value or empty charge lines", () => {
    const input = baseInput();
    input.items = [{ id: "1", category: "procedure", description: "", quantity: 0, unitPrice: 0 }];
    const result = validatePreAuthReview(input);
    expect(result.ready).toBe(false);
    expect(result.errors.some((entry) => entry.field === "items")).toBe(true);
    expect(result.total).toBe(0);
  });

  it("separates non-blocking completeness warnings from errors", () => {
    const input = baseInput();
    input.membershipNumber = "";
    input.doctorName = "";
    input.diagnosis = "";
    const result = validatePreAuthReview(input);
    expect(result.ready).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.map((entry) => entry.field)).toEqual(expect.arrayContaining(["membershipNumber", "doctor", "diagnosis"]));
  });

  it("builds a deterministic document payload without UI-only ids or timestamps", () => {
    const input = baseInput();
    const first = buildPreAuthDocumentPayload(input, "PA-2026-ABC12345");
    const second = buildPreAuthDocumentPayload(input, "PA-2026-ABC12345");

    expect(first).toEqual(second);
    expect(first.requestNumber).toBe("PA-2026-ABC12345");
    expect(first.document.items[0]).toEqual({
      category: "procedure",
      description: "Caesarean Section",
      quantity: 1,
      unitPrice: 4500,
      amount: 4500,
    });
    expect(first.document.total).toBe(4500);
    expect(first.document.items[0]).not.toHaveProperty("id");
    expect(first).not.toHaveProperty("generatedAt");
  });

  it("calculates the frozen total from the canonical billable items", () => {
    const input = baseInput();
    input.items.push({ id: "2", category: "laboratory", description: "", quantity: 2, unitPrice: 100 });
    input.items.push({ id: "3", category: "drugs", description: "Medication", quantity: 2, unitPrice: 250 });

    const payload = buildPreAuthDocumentPayload(input, "PA-2026-ABC12345");
    expect(payload.document.total).toBe(5000);
    expect(payload.document.items).toHaveLength(2);
  });
});
