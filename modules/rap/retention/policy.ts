export interface RapRetentionInputs {
  explicitOverrideDays?: number;
  partnerPolicyDays?: number;
  claimTypeDays?: number;
  globalDays: number;
  ghanaLegalMinimumDays: number;
}

export interface RapRetentionDecision {
  days: number;
  source: "EXPLICIT_OVERRIDE" | "PARTNER_POLICY" | "CLAIM_TYPE" | "GLOBAL" | "GHANA_LEGAL_MINIMUM";
}

const validDays = (value: number | undefined): value is number => Number.isSafeInteger(value) && value >= 0;

export function resolveRetentionDays(input: RapRetentionInputs): RapRetentionDecision {
  const candidates: Array<[RapRetentionDecision["source"], number | undefined]> = [
    ["EXPLICIT_OVERRIDE", input.explicitOverrideDays],
    ["PARTNER_POLICY", input.partnerPolicyDays],
    ["CLAIM_TYPE", input.claimTypeDays],
    ["GLOBAL", input.globalDays],
    ["GHANA_LEGAL_MINIMUM", input.ghanaLegalMinimumDays],
  ];
  const selected = candidates.find(([, days]) => validDays(days));
  if (!selected) throw new Error("RAP retention policy has no valid retention period.");
  return { days: selected[1] as number, source: selected[0] };
}

export type RapRetentionStatus = "ACTIVE" | "COMPRESSED" | "EXPIRED" | "DELETED" | "LEGAL_HOLD";

export interface RapRetentionSchedule {
  expiresAt: Date;
  notifyAt: Date[];
}

function assertNonNegativeDays(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`RAP ${name} must be a non-negative whole number of days.`);
  }
}

export function buildRetentionSchedule(
  createdAt: Date,
  retentionDays: number,
  notifyLeadDays = 7,
  reminderDays = 1,
): RapRetentionSchedule {
  if (!(createdAt instanceof Date) || !Number.isFinite(createdAt.getTime())) {
    throw new Error("RAP retention createdAt must be a valid date.");
  }
  assertNonNegativeDays(retentionDays, "retentionDays");
  assertNonNegativeDays(notifyLeadDays, "notifyLeadDays");
  assertNonNegativeDays(reminderDays, "reminderDays");
  const expiresAt = new Date(createdAt.getTime() + retentionDays * 86_400_000);
  if (!Number.isFinite(expiresAt.getTime())) {
    throw new Error("RAP retention expiration date is outside the supported date range.");
  }
  // Short retention windows must not schedule notifications before the record
  // exists. Clamp early notice offsets to creation time while preserving order.
  const createdTime = createdAt.getTime();
  const noticeTime = (daysBeforeExpiry: number) => new Date(
    Math.max(createdTime, expiresAt.getTime() - daysBeforeExpiry * 86_400_000),
  );
  return {
    expiresAt,
    notifyAt: [
      noticeTime(notifyLeadDays),
      noticeTime(reminderDays),
      expiresAt,
    ],
  };
}
