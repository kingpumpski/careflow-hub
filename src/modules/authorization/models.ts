/** Canonical pre-authorization domain interfaces shared by the request builder, cost builder and PDF engine. */

export type AuthorizationState = "draft" | "pending" | "approved" | "rejected" | "completed";

export const AUTHORIZATION_STATES: { value: AuthorizationState; label: string; next: AuthorizationState[] }[] = [
  { value: "draft", label: "Draft", next: ["pending"] },
  { value: "pending", label: "Pending Approval", next: ["approved", "rejected"] },
  { value: "approved", label: "Approved", next: ["completed"] },
  { value: "rejected", label: "Rejected", next: ["draft"] },
  { value: "completed", label: "Completed", next: [] },
];

export function canTransition(from: AuthorizationState, to: AuthorizationState): boolean {
  return AUTHORIZATION_STATES.find((s) => s.value === from)?.next.includes(to) ?? false;
}

export interface CostItem {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface AuthorizationRequest {
  id: string;
  requestNumber: string;
  patientName: string;
  membershipNumber: string | null;
  clientCompanyName: string | null;
  insuranceCompanyId: string | null;
  doctorName: string | null;
  diagnosis: string[];
  procedureName: string | null;
  procedureDate: string | null;
  accommodationDays: number | null;
  state: AuthorizationState;
  totalCost: number;
  createdAt: string;
}

/** Request numbers are derived, never stored, so they stay stable across environments. */
export function requestNumber(row: { id: string; created_at?: string }): string {
  const year = row.created_at ? new Date(row.created_at).getFullYear() : new Date().getFullYear();
  return `PA-${year}-${row.id.slice(0, 8).toUpperCase()}`;
}

export function recalcCostItem(item: CostItem): CostItem {
  return { ...item, amount: Number(item.quantity || 0) * Number(item.unitPrice || 0) };
}

export function costTotal(items: CostItem[]): number {
  return items.reduce((s, i) => s + Number(i.amount || 0), 0);
}
