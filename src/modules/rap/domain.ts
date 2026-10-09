/**
 * RAP deterministic domain primitives.
 *
 * Pure functions only: no database access, network calls, PHI logging, or writes.
 * Keep this module isolated until the RAP feature gate and host authorization
 * contracts are wired and reviewed.
 */

export const RAP_DEFAULT_ENABLED = false as const;
export const RAP_ESCALATION_CONFIDENCE = 0.85;

export type RapStatus =
  | "DRAFT"
  | "IN_REVIEW"
  | "VALIDATED"
  | "FLAGGED"
  | "READY"
  | "EXPORTED"
  | "SUBMITTED"
  | "VOID";

export type FindingSeverity = "INFO" | "WARNING" | "ERROR" | "BLOCKER";

export interface RapFinding {
  /** Stable rule identifier, e.g. RAP-STRUCT-001. */
  ruleId: string;
  ruleSetVersion: string;
  code: string;
  severity: FindingSeverity;
  message: string;
  /** Opaque entity reference; never put patient details here. */
  entityRef?: string;
  evidenceRefs?: readonly string[];
  resolved?: boolean;
}

export interface RapAssessment {
  status: RapStatus;
  findings: readonly RapFinding[];
  version: number;
}

export interface RiskAssessment {
  score: number;
  requiresHumanReview: boolean;
  blockingFindingCount: number;
  unresolvedFindingCount: number;
}

const TRANSITIONS: Readonly<Record<RapStatus, readonly RapStatus[]>> = {
  DRAFT: ["IN_REVIEW", "VOID"],
  IN_REVIEW: ["VALIDATED", "FLAGGED", "DRAFT", "VOID"],
  VALIDATED: ["READY", "FLAGGED", "IN_REVIEW", "VOID"],
  FLAGGED: ["IN_REVIEW", "VALIDATED", "VOID"],
  READY: ["EXPORTED", "SUBMITTED", "IN_REVIEW", "VOID"],
  EXPORTED: ["IN_REVIEW", "VOID"],
  SUBMITTED: [],
  VOID: [],
};

const SEVERITY_WEIGHT: Readonly<Record<FindingSeverity, number>> = {
  INFO: 0,
  WARNING: 10,
  ERROR: 25,
  BLOCKER: 100,
};

export class RapDomainError extends Error {
  readonly code: "INVALID_TRANSITION" | "STALE_VERSION" | "BLOCKING_FINDINGS" | "INVALID_FINDING";

  constructor(
    code: RapDomainError["code"],
    message: string,
  ) {
    super(message);
    this.name = "RapDomainError";
    this.code = code;
  }
}

/**
 * Canonical JSON representation for digest inputs. This intentionally rejects
 * values outside JSON data (undefined, functions, symbols, bigint, cycles),
 * sorts object keys, and preserves array order. Domain-specific normalization
 * must happen before calling this function.
 *
 * For cryptographic signatures, pair this with a vetted canonicalization
 * standard and server-side cryptographic implementation; this function alone
 * is not a signing primitive.
 */
export function canonicalizeJson(value: unknown): string {
  const ancestors = new Set<object>();

  const visit = (input: unknown): string => {
    if (input === null) return "null";
    if (typeof input === "string" || typeof input === "boolean") {
      return JSON.stringify(input);
    }
    if (typeof input === "number") {
      if (!Number.isFinite(input)) throw new TypeError("Non-finite numbers are not valid RAP JSON values.");
      return JSON.stringify(input);
    }
    if (typeof input !== "object") {
      throw new TypeError("RAP canonicalization accepts JSON-compatible values only.");
    }

    if (ancestors.has(input)) throw new TypeError("Circular references are not valid RAP JSON values.");
    ancestors.add(input);
    try {
      if (Array.isArray(input)) return `[${input.map(visit).join(",")}]`;

      const prototype = Object.getPrototypeOf(input);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError("RAP canonicalization accepts plain objects only.");
      }

      const record = input as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      return `{${keys.map((key) => {
        const child = record[key];
        if (child === undefined) throw new TypeError("Undefined properties are not valid RAP JSON values.");
        return `${JSON.stringify(key)}:${visit(child)}`;
      }).join(",")}}`;
    } finally {
      ancestors.delete(input);
    }
  };

  return visit(value);
}

export function unresolvedFindings(findings: readonly RapFinding[]): RapFinding[] {
  return findings.filter((finding) => finding.resolved !== true);
}

export function hasBlockingFindings(findings: readonly RapFinding[]): boolean {
  return unresolvedFindings(findings).some(
    (finding) => finding.severity === "BLOCKER" || finding.severity === "ERROR",
  );
}

/** Explainable, bounded deterministic indicator; never an adjudication decision. */
export function calculateRiskAssessment(
  findings: readonly RapFinding[],
  confidence?: number,
): RiskAssessment {
  const unresolved = unresolvedFindings(findings);
  const weighted = unresolved.reduce((sum, finding) => sum + SEVERITY_WEIGHT[finding.severity], 0);
  const score = Math.min(100, Math.max(0, weighted));
  const blockingFindingCount = unresolved.filter(
    (finding) => finding.severity === "BLOCKER" || finding.severity === "ERROR",
  ).length;

  const validConfidence = confidence !== undefined && Number.isFinite(confidence)
    && confidence >= 0 && confidence <= 1;

  return {
    score,
    requiresHumanReview:
      blockingFindingCount > 0 ||
      unresolved.some((finding) => finding.severity === "WARNING") ||
      (validConfidence && confidence! >= RAP_ESCALATION_CONFIDENCE),
    blockingFindingCount,
    unresolvedFindingCount: unresolved.length,
  };
}

export function validateFinding(finding: RapFinding): void {
  if (!finding.ruleId.trim() || !finding.ruleSetVersion.trim() || !finding.code.trim()) {
    throw new RapDomainError("INVALID_FINDING", "A finding requires rule ID, rule-set version, and code.");
  }
  if (!Object.prototype.hasOwnProperty.call(SEVERITY_WEIGHT, finding.severity)) {
    throw new RapDomainError("INVALID_FINDING", "Finding severity is not recognized.");
  }
  if (!finding.message.trim()) {
    throw new RapDomainError("INVALID_FINDING", "A finding requires a safe, user-facing explanation.");
  }
}

export function transitionAssessment(
  assessment: RapAssessment,
  nextStatus: RapStatus,
  expectedVersion: number,
): RapAssessment {
  if (assessment.version !== expectedVersion) {
    throw new RapDomainError("STALE_VERSION", "This RAP assessment changed. Refresh before retrying.");
  }

  if (!TRANSITIONS[assessment.status].includes(nextStatus)) {
    throw new RapDomainError(
      "INVALID_TRANSITION",
      `Transition from ${assessment.status} to ${nextStatus} is not permitted.`,
    );
  }

  if ((nextStatus === "READY" || nextStatus === "EXPORTED" || nextStatus === "SUBMITTED")
    && hasBlockingFindings(assessment.findings)) {
    throw new RapDomainError(
      "BLOCKING_FINDINGS",
      "Resolve all ERROR and BLOCKER findings before this assessment can progress.",
    );
  }

  return { ...assessment, status: nextStatus, version: assessment.version + 1 };
}

/** Stable ordering for repeatable UI, persisted snapshots, and test assertions. */
export function sortFindings(findings: readonly RapFinding[]): RapFinding[] {
  const severityOrder: Record<FindingSeverity, number> = {
    BLOCKER: 0,
    ERROR: 1,
    WARNING: 2,
    INFO: 3,
  };
  return [...findings].sort((a, b) =>
    severityOrder[a.severity] - severityOrder[b.severity]
    || a.ruleId.localeCompare(b.ruleId)
    || a.code.localeCompare(b.code),
  );
}
