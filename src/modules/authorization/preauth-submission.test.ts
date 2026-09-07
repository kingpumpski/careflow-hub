import { describe, expect, it } from "vitest";
import { buildPreAuthAttachmentManifest, buildPreAuthIdempotencyKey, buildPreAuthRecipientManifest } from "./preauth-submission";

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

  it("creates a revision-specific PDF attachment manifest", () => {
    expect(buildPreAuthAttachmentManifest("PA-2026-ABC12345", 2)).toEqual([{
      type: "pdf",
      name: "PA-2026-ABC12345-v2.pdf",
      mimeType: "application/pdf",
      sizeBytes: null,
      storagePath: null,
    }]);
  });
});
