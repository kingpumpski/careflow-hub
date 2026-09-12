import { describe, expect, it } from "vitest";
import { assertExternalProcessingSafe, assertPersonaToolAllowed, enforceAiConfidence } from "./policy";

describe("RAP persona policy", () => {
  it("isolates persona tools", () => {
    expect(() => assertPersonaToolAllowed("CLAIMS_SPECIALIST", "scan_integrity")).toThrow();
    expect(() => assertPersonaToolAllowed("PROJECT_ADMINISTRATOR", "get_claim")).toThrow();
    expect(() => assertPersonaToolAllowed("IT_OFFICER", "research_security_advisory")).not.toThrow();
  });

  it("forces human review below confidence threshold", () => {
    const result = enforceAiConfidence({ persona: "CLAIMS_SPECIALIST", action: "match", confidence: 0.84, result: {}, evidence: ["kb:1"], requiresHumanReview: false });
    expect(result.requiresHumanReview).toBe(true);
  });

  it("rejects PHI for external processing", () => {
    expect(() => assertExternalProcessingSafe({ containsPhi: true, containsPii: false, containsSecrets: false, approvedCrossBorder: true })).toThrow();
  });
});
