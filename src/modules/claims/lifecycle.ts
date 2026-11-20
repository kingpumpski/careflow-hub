export const CLAIM_STATUSES = [
  "draft",
  "verified",
  "submitted",
  "acknowledged",
  "under_review",
  "queried",
  "approved",
  "partially_approved",
  "rejected",
  "appealed",
  "partially_paid",
  "paid",
  "reconciled",
  "closed",
] as const;

export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

const TRANSITIONS: Record<ClaimStatus, readonly ClaimStatus[]> = {
  draft: ["verified"],
  verified: ["submitted", "draft"],
  submitted: ["acknowledged", "under_review", "queried", "rejected"],
  acknowledged: ["under_review", "queried", "rejected"],
  under_review: ["queried", "approved", "partially_approved", "rejected"],
  queried: ["verified", "submitted", "under_review", "rejected"],
  approved: ["partially_paid", "paid", "reconciled"],
  partially_approved: ["partially_paid", "paid", "appealed", "reconciled"],
  rejected: ["appealed", "closed", "submitted"],
  appealed: ["approved", "partially_approved", "rejected", "closed"],
  partially_paid: ["paid", "reconciled"],
  paid: ["reconciled", "closed"],
  reconciled: ["closed"],
  closed: [],
};

export function canTransitionClaim(from: ClaimStatus, to: ClaimStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertClaimTransition(from: ClaimStatus, to: ClaimStatus): void {
  if (!canTransitionClaim(from, to)) {
    throw new Error(`Invalid claim lifecycle transition: ${from} -> ${to}`);
  }
}
