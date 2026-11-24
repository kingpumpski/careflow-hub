import { describe, expect, it } from "vitest";
import { assertExternalProcessingSafe, assertPersonaToolAllowed, enforceAiConfidence } from "./policy";

const suggestion = (confidence: number) => ({
  persona: "CLAIMS_SPECIALIST" as const,
  action: "match",
  confidence,
  result: {},
  evidence: ["kb:1"],
  requiresHumanReview: false,
});

describe("RAP persona policy", () => {
  it("isolates persona tools", () => {
    expect(() => assertPersonaToolAllowed("CLAIMS_SPECIALIST", "scan_integrity")).toThrow();
    expect(() => assertPersonaToolAllowed("PROJECT_ADMINISTRATOR", "get_claim")).toThrow();
    expect(() => assertPersonaToolAllowed("IT_OFFICER", "research_security_advisory")).not.toThrow();
  });

  it("forces human review below confidence threshold", () => {
    expect(enforceAiConfidence(suggestion(0.84)).requiresHumanReview).toBe(true);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.01, 1.01])("forces review for invalid confidence %s", (confidence) => {
    expect(enforceAiConfidence(suggestion(confidence)).requiresHumanReview).toBe(true);
  });

  it("rejects an invalid configured threshold", () => {
    expect(() => enforceAiConfidence(suggestion(0.99), Number.NaN)).toThrow(/between 0 and 1/);
    expect(() => enforceAiConfidence(suggestion(0.99), 1.01)).toThrow(/between 0 and 1/);
  });

  it("rejects PHI for external processing", () => {
    expect(() => assertExternalProcessingSafe({ containsPhi: true, containsPii: false, containsSecrets: false, approvedCrossBorder: true })).toThrow();
  });
});
