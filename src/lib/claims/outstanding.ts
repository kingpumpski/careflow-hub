export type OutstandingStatus = "actual" | "partial" | "provisional";

export function calculateOutstanding(submitted: number, rejected: number, paid: number, certifiedWithholdingTax: number): number {
  return Math.max(0, Number(submitted || 0) - Number(rejected || 0) - Number(paid || 0) - Number(certifiedWithholdingTax || 0));
}

export function resolveOutstandingStatus(
  paymentEntryCount: number,
  certificateEntryCount: number,
  actualWithholdingTax: number | null = null,
  certifiedWithholdingTax = 0,
): OutstandingStatus {
  if (paymentEntryCount > 0 && actualWithholdingTax != null && (actualWithholdingTax <= 0 || certifiedWithholdingTax >= actualWithholdingTax)) return "actual";
  if (certificateEntryCount > 0 && certifiedWithholdingTax > 0) return "partial";
  return "provisional";
}

export function resolveAggregateStatus(statuses: OutstandingStatus[]): OutstandingStatus {
  if (statuses.length > 0 && statuses.every((status) => status === "actual")) return "actual";
  if (statuses.some((status) => status === "actual" || status === "partial")) return "partial";
  return "provisional";
}
