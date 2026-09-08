import { describe, expect, it } from "vitest";
import { buildPreAuthAttachmentManifest, buildPreAuthIdempotencyKey, buildPreAuthRecipientManifest, buildPreAuthSubmissionPackageFromSnapshot } from "./preauth-submission";

const snapshot = {
  schemaVersion: 1 as const,
  requestNumber: "PA-2026-ABC12345",
  issuedDate: "08/09/2026",
  patient: { id: "patient-1", name: "Ama Doe", membershipNumber: "MEM-1", phone: null, companyName: "Example Ltd" },
  insurer: { id: "insurer-1", name: "Example Insurer", email: "claims@example.com" },
  provider: { name: "Example Hospital", address: null, phone: null, email: null, logoUrl: null },
  clinical: { procedureId: "procedure-1", procedureName: "Procedure", procedureDate: "2026-09-10", diagnosis: null, doctorName: null },
  document: { format: "ghana" as const, currency: "GH¢", items: [{ category: "procedure" as const, description: "Procedure", quantity: 1, unitPrice: 100, amount: 100 }], total: 100 },
};

describe("pre-authorization submission lifecycle", () => {
  it("creates a stable idempotency key per request revision", () => {
    expect(buildPreAuthIdempotencyKey("preauth-1", 3)).toBe("preauth-1:v3");
  });

  it("deduplicates and normalizes recipient addresses", () => {
    expect(buildPreAuthRecipientManifest({
      insurerEmail: "Claims@Insurer.example",
      insurerName: "Insurer",
      additionalEmails: ["claims@insurer.example", "finance@insurer.example"],
      ccEmails: ["Finance@Insurer.example", "provider@example.com"],
    })).toEqual([
      { type: "to", email: "claims@insurer.example", name: "Insurer" },
      { type: "cc", email: "finance@insurer.example", name: null },
      { type: "cc", email: "provider@example.com", name: null },
    ]);
  });

  it("rejects malformed recipient addresses instead of persisting them in the manifest", () => {
    expect(buildPreAuthRecipientManifest({
      insurerEmail: "not-an-email",
      additionalEmails: ["claims@example.com", "also-invalid"],
    })).toEqual([{ type: "cc", email: "claims@example.com", name: null }]);
  });

  it("creates a revision-specific PDF attachment manifest", () => {
    expect(buildPreAuthAttachmentManifest("PA-2026-ABC12345", 2)).toEqual([{
      type: "pdf",
      name: "PA-2026-ABC12345-v2.pdf",
      mimeType: "application/pdf",
      sizeBytes: null,
      storagePath: null,
    }]);
  });

  it("builds the handoff package from the supplied frozen snapshot without rebuilding it from mutable form state", () => {
    const result = buildPreAuthSubmissionPackageFromSnapshot({
      preauthId: "preauth-1",
      versionNumber: 2,
      requestNumber: "PA-2026-ABC12345",
      snapshot,
      subject: "Authorization request",
      messageBody: "Please review.",
      insurerEmail: "claims@example.com",
    });

    expect(result.snapshot).toBe(snapshot);
    expect(result.idempotencyKey).toBe("preauth-1:v2");
    expect(result.recipients).toEqual([{ type: "to", email: "claims@example.com", name: null }]);
    expect(result.attachments[0].name).toBe("PA-2026-ABC12345-v2.pdf");
  });
});
