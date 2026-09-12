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

const validDays = (value: number | undefined): value is number => Number.isInteger(value) && value >= 0;

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

export function buildRetentionSchedule(createdAt: Date, retentionDays: number, notifyLeadDays = 7, reminderDays = 1): RapRetentionSchedule {
  if (!validDays(retentionDays)) throw new Error("RAP retentionDays must be a non-negative integer.");
  const expiresAt = new Date(createdAt.getTime() + retentionDays * 86_400_000);
  return {
    expiresAt,
    notifyAt: [
      new Date(expiresAt.getTime() - notifyLeadDays * 86_400_000),
      new Date(expiresAt.getTime() - reminderDays * 86_400_000),
      expiresAt,
    ],
  };
}
