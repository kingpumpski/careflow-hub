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
type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isDiagnosis = (value: unknown): value is RapDiagnosisInput =>
  isRecord(value) && typeof value.code === "string" && typeof value.confirmed === "boolean";

const isService = (value: unknown): value is RapServiceInput =>
  isRecord(value)
  && typeof value.id === "string"
  && typeof value.amount === "number"
  && Array.isArray(value.diagnosisCodes)
  && value.diagnosisCodes.every((code) => typeof code === "string");

const isRapCaseInput = (value: unknown): value is RapCaseInput =>
  isRecord(value)
  && typeof value.tenantId === "string"
  && typeof value.facilityId === "string"
  && typeof value.currency === "string"
  && Array.isArray(value.diagnoses)
  && value.diagnoses.every(isDiagnosis)
  && Array.isArray(value.services)
  && value.services.every(isService);

const isExecutionContext = (value: unknown): value is RapExecutionContext =>
  isRecord(value)
  && typeof value.verifiedTenantId === "string"
  && typeof value.ruleSetVersion === "string"
  && typeof value.pipelineVersion === "string";

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

const invalidPayloadFinding = (ruleSetVersion: string): RapFinding =>
  finding(
    "RAP-SEC-002",
    "INVALID_INPUT_SHAPE",
    "BLOCKER",
    "The assessment payload or verified execution context is invalid.",
    ruleSetVersion,
  );

/**
 * Allow-listed deterministic rules. Do not load executable rules from the
 * request, database text fields, or remote bundles.
 */
const RULES: readonly Rule[] = [
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
  (input, context) => {
    const seen = new Set<string>();
    return input.services
      .filter((service) => {
        const key = service.id.trim();
        if (!key || seen.has(key)) return true;
        seen.add(key);
        return false;
      })
      .map((service) => finding(
        "RAP-STRUCT-003",
        "INVALID_OR_DUPLICATE_SERVICE_ID",
        "ERROR",
        "Each service requires a unique, non-empty identifier.",
        context.ruleSetVersion,
        isNonEmptyString(service.id) ? service.id : undefined,
      ));
  },
  (input, context) => input.services
    .filter((service) => !Number.isFinite(service.amount) || service.amount < 0)
    .map((service) => finding(
      "RAP-FIN-002",
      "INVALID_SERVICE_AMOUNT",
      "ERROR",
      "A service amount must be a finite, non-negative number.",
      context.ruleSetVersion,
      isNonEmptyString(service.id) ? service.id : undefined,
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
        isNonEmptyString(service.id) ? service.id : undefined,
      ));
  },
];

export function runRapValidation(
  input: unknown,
  context: unknown,
): RapPipelineResult {
  const safeContext: RapExecutionContext = isExecutionContext(context)
    ? context
    : {
        verifiedTenantId: "",
        ruleSetVersion: "unavailable",
        pipelineVersion: "unavailable",
      };

  let findings: RapFinding[];

  // Validate the envelope before touching nested properties. Missing or malformed
  // authorization context must never degrade to a successful empty assessment.
  if (!isExecutionContext(context) || !isNonEmptyString(safeContext.ruleSetVersion)
    || !isNonEmptyString(safeContext.pipelineVersion)) {
    findings = [invalidPayloadFinding(safeContext.ruleSetVersion || "unavailable")];
  } else if (!isRapCaseInput(input)) {
    findings = [invalidPayloadFinding(safeContext.ruleSetVersion)];
  } else if (!isNonEmptyString(safeContext.verifiedTenantId)
    || input.tenantId !== safeContext.verifiedTenantId) {
    // Fail closed before evaluating tenant payload details.
    findings = [finding(
      "RAP-SEC-001",
      "TENANT_CONTEXT_MISMATCH",
      "BLOCKER",
      "The assessment tenant does not match the verified access context.",
      safeContext.ruleSetVersion,
    )];
  } else {
    findings = sortFindings(RULES.flatMap((rule) => rule(input, safeContext)));
  }

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
