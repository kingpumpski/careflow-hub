import { describe, expect, it } from "vitest";
import {
  calculateClaimTotal,
  catalogItemToClaimLine,
  createClaimResponseDraft,
  mapClaimCatalogItems,
  type ClaimAnalysisResult,
} from "./claimDiagnosis.service";

describe("claim diagnosis assistant domain helpers", () => {
  it("calculates manual claim totals from quantities and unit prices", () => {
    expect(calculateClaimTotal([
      { quantity: 2, unitPrice: 70 },
      { quantity: 1.5, unitPrice: 220 },
    ])).toBe(470);
  });

  it("ignores invalid and negative amounts when calculating totals", () => {
    expect(calculateClaimTotal([
      { quantity: -2, unitPrice: 100 },
      { quantity: 2, unitPrice: Number.NaN },
    ])).toBe(0);
  });

  it("maps active catalog items and existing procedures into searchable claim items", () => {
    const items = mapClaimCatalogItems(
      [
        { id: "catalog-1", item_name: "Lipid Profile", category: "Laboratory", unit_price: 290, archived: false },
        { id: "catalog-2", item_name: "Archived item", unit_price: 10, archived: true },
      ],
      [
        { id: "procedure-1", procedure_code: "94010", procedure_name: "Spirometry", category: "HCPCS", default_tariff: 80 },
      ],
    );

    expect(items).toEqual([
      { id: "catalog-1", code: "", name: "Lipid Profile", category: "Other", unitPrice: 290 },
      { id: "procedure-1", code: "94010", name: "Spirometry", category: "HCPCS", unitPrice: 80 },
    ]);
  });

  it("creates a fresh editable line item from an existing service catalog entry", () => {
    const line = catalogItemToClaimLine({
      id: "procedure-1",
      code: "94010",
      name: "Spirometry",
      category: "CPT",
      unitPrice: 80,
    });

    expect(line).toMatchObject({
      code: "94010",
      description: "Spirometry",
      quantity: 1,
      unitPrice: 80,
      category: "CPT",
      status: "Pending",
    });
    expect(line.id).toBeTruthy();
  });

  it("creates an appeal draft from actual analysis values without inventing claim details", () => {
    const analysis: ClaimAnalysisResult = {
      analysis_id: "analysis-1",
      document_sha256: "a".repeat(64),
      workflowType: "rejected_claim",
      patient_name: "Patient A",
      claim_number: "",
      date_of_service: "",
      clinical_summary: "Documented acute cough",
      original_diagnoses: [],
      recommended_diagnoses: [
        {
          code: "J18.9",
          version: "ICD-10",
          description: "Pneumonia, unspecified organism",
          confidence: 80,
          justification: "Supported by documented findings",
          sourceText: "acute cough",
        },
      ],
      service_items: [
        { code: "94010", description: "Spirometry", quantity: 1, dateOfService: "", category: "CPT" },
      ],
      compliance_flags: [],
      extracted_confidence: 90,
      warnings: [],
    };

    const response = createClaimResponseDraft(analysis, "Missing Secondary Diagnosis");

    expect(response).toContain("Patient: Patient A | Claim: Not provided | Date of service: Not provided");
    expect(response).toContain("Missing Secondary Diagnosis");
    expect(response).toContain("J18.9");
    expect(response).toContain("94010 Spirometry");
    expect(response).toContain("recommendations only");
  });
});
