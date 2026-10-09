import {
  sortFindings,
  type RapFinding,
} from "./domain";

export interface RapDiagnosisInput {
  code: string;
  confirmed: boolean;
}

export interface RapServiceInput {
  id: string;
  amount: number;
  diagnosisCodes: readonly string[];
}

export interface RapCaseInput {
  /** Must be checked against verified context; never treated as identity proof. */
  tenantId: string;
  facilityId: string;
  currency: string;
  diagnoses: readonly RapDiagnosisInput[];
  services: readonly RapServiceInput[];
}

export interface RapExecutionContext {
  /** Obtained from authenticated server-side membership, not request JSON. */
  verifiedTenantId: string;
  ruleSetVersion: string;
  pipelineVersion: string;
}

export interface RapPipelineResult {
  pipelineVersion: string;
  ruleSetVersion: string;
  outcome: "PASS" | "REVIEW_REQUIRED" | "BLOCKED";
  findings: RapFinding[];
  summary: {
    blockerCount: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
}

type Rule = (input: RapCaseInput, context: RapExecutionContext) => RapFinding[];

const finding = (
  ruleId: string,
  code: string,
  severity: RapFinding["severity"],
  message: string,
  ruleSetVersion: string,
  entityRef?: string,
): RapFinding => ({
  ruleId,
  code,
  severity,
  message,
  ruleSetVersion,
  ...(entityRef ? { entityRef } : {}),
});

/**
 * Allow-listed deterministic rules. Do not load executable rules from the
 * request, database text fields, or remote bundles.
 */
const RULES: readonly Rule[] = [
  (input, context) => input.tenantId === context.verifiedTenantId
    ? []
    : [finding(
        "RAP-SEC-001",
        "TENANT_CONTEXT_MISMATCH",
        "BLOCKER",
        "The assessment tenant does not match the verified access context.",
        context.ruleSetVersion,
      )],
  (input, context) => input.facilityId.trim()
    ? []
    : [finding(
        "RAP-STRUCT-001",
        "FACILITY_REQUIRED",
        "ERROR",
        "A facility must be selected before validation.",
        context.ruleSetVersion,
      )],
  (input, context) => input.currency === "GHS"
    ? []
    : [finding(
        "RAP-FIN-001",
        "UNSUPPORTED_CURRENCY",
        "ERROR",
        "This RAP validation profile accepts Ghana cedi (GHS) only.",
        context.ruleSetVersion,
      )],
  (input, context) => input.diagnoses.some((diagnosis) =>
    diagnosis.confirmed && diagnosis.code.trim().length > 0)
    ? []
    : [finding(
        "RAP-CLIN-001",
        "CONFIRMED_DIAGNOSIS_REQUIRED",
        "ERROR",
        "At least one confirmed diagnosis with a code is required.",
        context.ruleSetVersion,
      )],
  (input, context) => input.services.length > 0
    ? []
    : [finding(
        "RAP-STRUCT-002",
        "SERVICE_REQUIRED",
        "ERROR",
        "At least one service item is required.",
        context.ruleSetVersion,
      )],
  (input, context) => input.services
    .filter((service) => !Number.isFinite(service.amount) || service.amount < 0)
    .map((service) => finding(
      "RAP-FIN-002",
      "INVALID_SERVICE_AMOUNT",
      "ERROR",
      "A service amount must be a finite, non-negative number.",
      context.ruleSetVersion,
      service.id,
    )),
  (input, context) => {
    const confirmedCodes = new Set(input.diagnoses
      .filter((diagnosis) => diagnosis.confirmed && diagnosis.code.trim())
      .map((diagnosis) => diagnosis.code.trim()));

    return input.services
      .filter((service) => !service.diagnosisCodes.some((code) => confirmedCodes.has(code.trim())))
      .map((service) => finding(
        "RAP-CLIN-002",
        "SERVICE_DIAGNOSIS_LINK_REQUIRED",
        "ERROR",
        "Each service must link to at least one confirmed diagnosis.",
        context.ruleSetVersion,
        service.id,
      ));
  },
];

export function runRapValidation(
  input: RapCaseInput,
  context: RapExecutionContext,
): RapPipelineResult {
  const safeContext: RapExecutionContext = {
    verifiedTenantId: context.verifiedTenantId,
    ruleSetVersion: context.ruleSetVersion,
    pipelineVersion: context.pipelineVersion,
  };

  // Fail closed before evaluating any tenant payload if the verified scope is missing
  // or does not match. This avoids producing detail findings for a cross-tenant request.
  const tenantMismatch = !safeContext.verifiedTenantId.trim()
    || input.tenantId !== safeContext.verifiedTenantId;
  const findings = tenantMismatch
    ? [finding(
        "RAP-SEC-001",
        "TENANT_CONTEXT_MISMATCH",
        "BLOCKER",
        "The assessment tenant does not match the verified access context.",
        safeContext.ruleSetVersion,
      )]
    : sortFindings(RULES.slice(1).flatMap((rule) => rule(input, safeContext)));
  const count = (severity: RapFinding["severity"]) =>
    findings.filter((item) => item.severity === severity && item.resolved !== true).length;
  const blockerCount = count("BLOCKER");
  const errorCount = count("ERROR");
  const warningCount = count("WARNING");
  const infoCount = count("INFO");

  return {
    pipelineVersion: safeContext.pipelineVersion,
    ruleSetVersion: safeContext.ruleSetVersion,
    outcome: blockerCount > 0 ? "BLOCKED" : errorCount > 0 ? "REVIEW_REQUIRED" : "PASS",
    findings,
    summary: { blockerCount, errorCount, warningCount, infoCount },
  };
}
