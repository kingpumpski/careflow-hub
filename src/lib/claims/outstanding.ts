export type OutstandingStatus = "actual" | "provisional";

export function calculateOutstanding(submitted: number, rejected: number, paid: number, withholdingTax: number): number {
  return Math.max(0, Number(submitted || 0) - Number(rejected || 0) - Number(paid || 0) - Number(withholdingTax || 0));
}

export function resolveOutstandingStatus(paymentEntryCount: number, withholdingTaxEntryCount: number): OutstandingStatus {
  return paymentEntryCount > 0 && withholdingTaxEntryCount > 0 ? "actual" : "provisional";
}

export function resolveAggregateStatus(statuses: OutstandingStatus[]): OutstandingStatus {
  return statuses.length > 0 && statuses.every(status => status === "actual") ? "actual" : "provisional";
}
