import { describe, expect, it } from "vitest";
import { runRapValidation, type RapCaseInput, type RapExecutionContext } from "./pipeline";

const context: RapExecutionContext = {
  verifiedTenantId: "tenant-a",
  ruleSetVersion: "1.0.0",
  pipelineVersion: "rap-pipeline-1",
};

const validInput: RapCaseInput = {
  tenantId: "tenant-a",
  facilityId: "facility-a",
  currency: "GHS",
  diagnoses: [{ code: "DX-001", confirmed: true }],
  services: [{ id: "service-a", amount: 50, diagnosisCodes: ["DX-001"] }],
};

describe("RAP deterministic validation pipeline", () => {
  it("passes a structurally valid case and records versions", () => {
    const result = runRapValidation(validInput, context);
    expect(result.outcome).toBe("PASS");
    expect(result.findings).toEqual([]);
    expect(result.pipelineVersion).toBe("rap-pipeline-1");
    expect(result.ruleSetVersion).toBe("1.0.0");
  });

  it("blocks when request tenant differs from verified server context", () => {
    const result = runRapValidation({ ...validInput, tenantId: "tenant-b" }, context);
    expect(result.outcome).toBe("BLOCKED");
    expect(result.summary.blockerCount).toBe(1);
    expect(result.findings[0].code).toBe("TENANT_CONTEXT_MISMATCH");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).not.toContain("tenant-b");
  });

  it("reports missing confirmed diagnosis, service, and unsupported currency", () => {
    const result = runRapValidation({
      ...validInput,
      currency: "USD",
      diagnoses: [{ code: "", confirmed: false }],
      services: [],
    }, context);
    expect(result.outcome).toBe("REVIEW_REQUIRED");
    expect(result.findings.map((item) => item.code)).toEqual([
      "CONFIRMED_DIAGNOSIS_REQUIRED",
      "UNSUPPORTED_CURRENCY",
      "SERVICE_REQUIRED",
    ]);
  });

  it("rejects negative and non-finite service amounts", () => {
    const result = runRapValidation({
      ...validInput,
      services: [
        { id: "negative", amount: -1, diagnosisCodes: ["DX-001"] },
        { id: "infinite", amount: Number.POSITIVE_INFINITY, diagnosisCodes: ["DX-001"] },
      ],
    }, context);
    expect(result.summary.errorCount).toBe(2);
    expect(result.findings.map((item) => item.entityRef)).toEqual(["negative", "infinite"]);
  });

  it("requires each service to link to a confirmed diagnosis", () => {
    const result = runRapValidation({
      ...validInput,
      diagnoses: [{ code: "DX-001", confirmed: false }],
    }, context);
    expect(result.findings.map((item) => item.code)).toContain("SERVICE_DIAGNOSIS_LINK_REQUIRED");
  });
});
