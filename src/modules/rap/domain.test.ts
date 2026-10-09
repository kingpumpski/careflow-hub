import { describe, expect, it } from "vitest";
import {
  RAP_DEFAULT_ENABLED,
  RAP_ESCALATION_CONFIDENCE,
  RapDomainError,
  calculateRiskAssessment,
  canonicalizeJson,
  hasBlockingFindings,
  sortFindings,
  transitionAssessment,
  validateFinding,
  type RapAssessment,
  type RapFinding,
} from "./domain";

const finding = (overrides: Partial<RapFinding> = {}): RapFinding => ({
  ruleId: "RAP-STRUCT-001",
  ruleSetVersion: "1.0.0",
  code: "MISSING_REQUIRED_FIELD",
  severity: "ERROR",
  message: "A required field is missing.",
  ...overrides,
});

const assessment = (overrides: Partial<RapAssessment> = {}): RapAssessment => ({
  status: "VALIDATED",
  findings: [],
  version: 3,
  ...overrides,
});

describe("RAP deterministic domain primitives", () => {
  it("keeps RAP disabled by default", () => {
    expect(RAP_DEFAULT_ENABLED).toBe(false);
  });

  it("canonicalizes object key order without changing array order", () => {
    expect(canonicalizeJson({ z: 1, a: { y: true, x: null }, list: [2, 1] }))
      .toBe('{"a":{"x":null,"y":true},"list":[2,1],"z":1}');
  });

  it("rejects unsupported values and cycles during canonicalization", () => {
    expect(() => canonicalizeJson({ value: undefined })).toThrow(TypeError);
    expect(() => canonicalizeJson(Number.NaN)).toThrow(TypeError);
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => canonicalizeJson(cyclic)).toThrow(/Circular references/);
  });

  it("requires stable identifiers and safe explanations for findings", () => {
    expect(() => validateFinding(finding())).not.toThrow();
    expect(() => validateFinding(finding({ ruleId: " " }))).toThrowError(RapDomainError);
    expect(() => validateFinding(finding({ message: "" }))).toThrowError(RapDomainError);
  });

  it("blocks readiness when unresolved errors exist but ignores resolved findings", () => {
    expect(hasBlockingFindings([finding()])).toBe(true);
    expect(hasBlockingFindings([finding({ resolved: true })])).toBe(false);
    expect(() => transitionAssessment(
      assessment({ findings: [finding()] }), "READY", 3,
    )).toThrowError(/Resolve all ERROR and BLOCKER findings/);
  });

  it("rejects stale versions and undocumented transitions", () => {
    expect(() => transitionAssessment(assessment(), "READY", 2))
      .toThrowError(/assessment changed/);
    expect(() => transitionAssessment(assessment({ status: "SUBMITTED" }), "DRAFT", 3))
      .toThrowError(/Transition from SUBMITTED to DRAFT is not permitted/);
  });

  it("increments the version for a permitted transition", () => {
    expect(transitionAssessment(assessment(), "READY", 3)).toEqual({
      status: "READY",
      findings: [],
      version: 4,
    });
  });

  it("returns a bounded explainable risk indicator and escalates high confidence", () => {
    const result = calculateRiskAssessment([finding({ severity: "WARNING" })], RAP_ESCALATION_CONFIDENCE);
    expect(result).toEqual({
      score: 10,
      requiresHumanReview: true,
      blockingFindingCount: 0,
      unresolvedFindingCount: 1,
    });
    expect(calculateRiskAssessment([finding({ severity: "BLOCKER" })]).score).toBe(100);
  });

  it("sorts findings deterministically without mutating the source array", () => {
    const original = [finding({ ruleId: "B", severity: "INFO" }), finding({ ruleId: "A", severity: "BLOCKER" })];
    expect(sortFindings(original).map((item) => item.ruleId)).toEqual(["A", "B"]);
    expect(original.map((item) => item.ruleId)).toEqual(["B", "A"]);
  });
});
