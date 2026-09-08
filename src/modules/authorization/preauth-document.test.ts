import { describe, expect, it } from "vitest";
import { preAuthPdfDataFromSnapshot } from "./preauth-document";
import { buildPreAuthDocumentPayload, type PreAuthReviewInput } from "./preauth-review";

const input: PreAuthReviewInput = {
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
  providerName: "Example Medical Centre",
  providerAddress: "1 Hospital Road, Accra",
  providerPhone: "+233300000000",
  providerLogoUrl: "https://example.com/logo.png",
  issuedDate: "08/09/2026",
  currency: "GH¢",
  format: "ghana",
  items: [{ id: "live-ui-row", category: "procedure", description: "Caesarean Section", quantity: 1, unitPrice: 4500 }],
};

describe("pre-authorization frozen PDF mapping", () => {
  it("derives all PDF header and clinical metadata from the frozen revision", () => {
    const snapshot = buildPreAuthDocumentPayload(input, "PA-2026-ABC12345");
    const data = preAuthPdfDataFromSnapshot(snapshot);

    expect(data).toEqual({
      requestNumber: "PA-2026-ABC12345",
      issuedDate: "08/09/2026",
      patientName: "Ama Mensah",
      membershipNumber: "ABC123",
      patientPhone: "+233240000000",
      companyName: "Example Company",
      providerName: "Example Medical Centre",
      providerAddress: "1 Hospital Road, Accra",
      providerPhone: "+233300000000",
      doctorName: "Dr. Mensah",
      procedureName: "Caesarean Section",
      procedureDate: "2026-09-15",
      diagnosis: "O82",
      currency: "GH¢",
      format: "ghana",
      logoUrl: "https://example.com/logo.png",
    });
  });

  it("does not depend on later mutations to the editable request", () => {
    const live = { ...input, items: input.items.map((item) => ({ ...item })) };
    const snapshot = buildPreAuthDocumentPayload(live, "PA-2026-ABC12345");

    live.patientName = "Changed Patient";
    live.providerName = "Changed Provider";
    live.items[0].unitPrice = 9999;

    const data = preAuthPdfDataFromSnapshot(snapshot);
    expect(data.patientName).toBe("Ama Mensah");
    expect(data.providerName).toBe("Example Medical Centre");
    expect(snapshot.document.total).toBe(4500);
  });
});
