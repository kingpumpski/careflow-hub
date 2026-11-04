import { describe, expect, it } from "vitest";
import {
  analyzeClaimDocument,
  generateRejectedClaimResponse,
  getManualCodeLookup,
} from "./claims-analysis";

describe("claims analysis workflow", () => {
  it("returns structured recommendations for a new claim", () => {
    const result = analyzeClaimDocument({ workflowType: "new_claim" });

    expect(result.workflowType).toBe("new_claim");
    expect(result.original_diagnoses.length).toBeGreaterThan(0);
    expect(result.recommended_diagnoses.length).toBeGreaterThan(0);
    expect(result.compliance_flags.length).toBeGreaterThan(0);
    expect(result.recommended_diagnoses[0].confidence).toBeGreaterThan(50);
  });

  it("builds the rejected-claim response with rejection-specific language", () => {
    const result = analyzeClaimDocument({ workflowType: "rejected_claim", reason: "Medical Necessity" });

    expect(result.response_message).toContain("We are writing to appeal");
    expect(result.response_message).toContain("Medical Necessity");
    expect(result.response_message).toContain("J18.9");
    expect(result.response_message).toContain("Alicia Thompson");
  });

  it("supports local ICD lookup for manual override", () => {
    const matches = getManualCodeLookup("chronic obstructive");

    expect(matches.some((entry) => entry.code === "J44.9")).toBe(true);
    expect(matches[0].description).toContain("Chronic obstructive");
  });

  it("generates a denial response using the passed diagnosis list", () => {
    const response = generateRejectedClaimResponse({
      claimId: "CLM-20487",
      patientName: "Alicia Thompson",
      dateOfService: "2026-10-15",
      rejectionReason: "Missing Secondary Diagnosis",
      diagnoses: [
        {
          code: "J18.9",
          version: "ICD-10",
          description: "Pneumonia, unspecified organism",
          confidence: 91,
          justification: "Supported by the chart",
          sourceText: "chart",
        },
      ],
      serviceItems: [
        { code: "94010", description: "Spirometry", quantity: 1, dateOfService: "2026-10-15", category: "CPT", source: "Procedure list" },
      ],
      clinicalSummary: "persistent cough and fever",
    });

    expect(response).toContain("Missing Secondary Diagnosis");
    expect(response).toContain("newly added secondary diagnosis codes");
  });
});
