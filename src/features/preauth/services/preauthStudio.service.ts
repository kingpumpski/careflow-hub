import { supabase } from "@/integrations/supabase/client";
import { getStoredFacilityId } from "./preauthFacility.service";
import { getCareFlowDataMode } from "@/modules/offline/data-mode";
import { createOfflinePreAuthDraft, updateOfflinePreAuthDraft } from "@/modules/offline/preauth-offline-repository";
import type { PreAuthReviewInput } from "@/modules/authorization/preauth-review";
import { listOffline } from "@/modules/offline/offline-store";

export interface ClientSuggestion { id: string; client_name: string; date_of_birth?: string | null; phone?: string | null; email?: string | null; address?: string | null; identifier?: string | null; membership_number?: string | null; use_count?: number; last_used_at?: string; }
export interface StudioItem { description: string; quantity: number; unit_price: number; amount: number; }
function escapeLike(value: string): string { return value.replace(/[%_\\]/g, (match) => `\\${match}`); }
const EDIT_REVISION_KEY = "careflow:preauth:edit-revision:";
const CREATE_IN_FLIGHT = new Map<string, Promise<any>>();
const UPDATE_IN_FLIGHT = new Map<string, Promise<any>>();

export function storePreAuthorizationEditRevision(preauthId: string, revision: string | null | undefined): void {
  if (!preauthId || !revision || typeof window === "undefined") return;
  window.sessionStorage.setItem(`${EDIT_REVISION_KEY}${preauthId}`, revision);
}

function readPreAuthorizationEditRevision(preauthId: string): string | null {
  if (!preauthId || typeof window === "undefined") return null;
  return window.sessionStorage.getItem(`${EDIT_REVISION_KEY}${preauthId}`);
}

function clearPreAuthorizationEditRevision(preauthId: string): void {
  if (!preauthId || typeof window === "undefined") return;
  window.sessionStorage.removeItem(`${EDIT_REVISION_KEY}${preauthId}`);
}

export async function searchClientSuggestions(query: string, limit = 12): Promise<ClientSuggestion[]> {
  const q = query.trim();
  if (limit < 1 || limit > 50) throw new Error("Suggestion limit must be between 1 and 50");
  const facilityId = getStoredFacilityId();
  if (!facilityId) return [];
  if (getCareFlowDataMode() === "offline") {
    const rows = await listOffline<Record<string, any>>("patients");
    return rows.filter((row) => !q || [row.patient_name, row.membership_number, row.phone, row.identifier].some((value) => String(value ?? "").toLowerCase().includes(q.toLowerCase()))).slice(0, limit).map((row) => ({ id: row.id, client_name: String(row.patient_name ?? ""), date_of_birth: row.date_of_birth ?? null, phone: row.phone ?? null, email: row.email ?? null, identifier: row.identifier ?? null, membership_number: row.membership_number ?? null }));
  }
  let request = ((supabase as any).from("preauth_client_suggestions")).select("id,client_name,date_of_birth,phone,email,address,identifier,membership_number,use_count,last_used_at").eq("facility_id", facilityId).order("last_used_at", { ascending: false }).limit(limit);
  if (q) { const pattern = `%${escapeLike(q)}%`; request = request.or(`normalized_name.ilike.${pattern},membership_number.ilike.${pattern},phone.ilike.${pattern},identifier.ilike.${pattern}`); }
  const { data, error } = await request;
  if (error) throw error;
  return (data || []) as ClientSuggestion[];
}

function withFacility(payload: Record<string, unknown>): Record<string, unknown> { const facilityId = getStoredFacilityId(); if (!facilityId && !payload.facility_id) throw new Error("Select a facility before creating a pre-authorization."); return { ...payload, facility_id: payload.facility_id || facilityId }; }

function toReviewInput(payload: Record<string, unknown>, items: StudioItem[]): PreAuthReviewInput {
  return { patientId: String(payload.patient_id ?? ""), patientName: String(payload.patient_name ?? payload.client_name ?? "Patient"), membershipNumber: String(payload.membership_number ?? ""), insurerId: String(payload.insurance_company_id ?? ""), insurerName: String(payload.insurer_name ?? payload.client_company_name ?? ""), procedureId: String(payload.procedure_id ?? ""), procedureName: String(payload.procedure_name ?? "Procedure"), procedureDate: String(payload.procedure_date ?? ""), diagnosis: String(payload.diagnosis ?? ""), doctorId: payload.doctor_id ? String(payload.doctor_id) : undefined, doctorName: String(payload.doctor_name ?? ""), patientPhone: String(payload.patient_phone ?? ""), companyName: String(payload.client_company_name ?? ""), insurerEmail: String(payload.insurer_email ?? ""), providerEmail: String(payload.provider_email ?? ""), providerName: String(payload.provider_name ?? ""), providerAddress: String(payload.provider_address ?? ""), providerPhone: String(payload.provider_phone ?? ""), providerLogoUrl: payload.provider_logo_url ? String(payload.provider_logo_url) : undefined, issuedDate: String(payload.issued_date ?? new Date().toLocaleDateString("en-GB")), currency: String(payload.document_currency ?? "GH¢"), format: (payload.document_format === "international" ? "international" : "ghana"), items: items.map((item, index) => ({ id: `${payload.id ?? "draft"}-${index}`, category: item.description ? "procedure" : "other", description: item.description, quantity: item.quantity, unitPrice: item.unit_price })), };
}

export async function getPreAuthorizationRevision(preauthId: string): Promise<string | null> {
  if (!preauthId) throw new Error("Pre-authorization ID is required.");
  if (getCareFlowDataMode() === "offline") {
    const rows = await listOffline<Record<string, any>>("preauthorizations");
    const row = rows.find((item) => String(item.id) === preauthId);
    return row?.updated_at ?? row?.updatedAt ?? null;
  }
  const { data, error } = await (supabase.from("pre_authorizations") as any).select("updated_at").eq("id", preauthId).maybeSingle();
  if (error) throw error;
  return data?.updated_at ?? null;
}

export function hasPreAuthorizationRevisionChanged(capturedRevision: string | null | undefined, currentRevision: string | null | undefined): boolean {
  if (!capturedRevision || !currentRevision) return false;
  return capturedRevision !== currentRevision;
}

export async function assertPreAuthorizationRevision(preauthId: string, capturedRevision: string | null | undefined): Promise<string | null> {
  if (!capturedRevision) return null;
  const currentRevision = await getPreAuthorizationRevision(preauthId);
  if (hasPreAuthorizationRevisionChanged(capturedRevision, currentRevision)) {
    const error = new Error("PREAUTH_REVISION_CONFLICT");
    (error as Error & { code?: string }).code = "PREAUTH_REVISION_CONFLICT";
    throw error;
  }
  return currentRevision;
}

export async function createPreAuthorizationAtomic(payload: Record<string, unknown>, items: StudioItem[], saveClientSuggestion: boolean) {
  if (getCareFlowDataMode() === "offline") return createOfflinePreAuthDraft(toReviewInput(withFacility(payload), items), String(payload.created_by ?? "") || null);
  const preparedPayload = withFacility(payload);
  const facilityId = String(preparedPayload.facility_id ?? "");
  const duplicateSignature = String(preparedPayload.duplicate_signature ?? "");
  const requestKey = `${facilityId}:${duplicateSignature || JSON.stringify([preparedPayload.patient_id, preparedPayload.insurance_company_id, preparedPayload.procedure_id, preparedPayload.procedure_date])}`;
  const existing = CREATE_IN_FLIGHT.get(requestKey);
  if (existing) return existing;
  const request = (async () => {
    const { data, error } = await (supabase.rpc as any)("create_preauthorization_atomic", { p_payload: preparedPayload, p_items: items.map(({ description, quantity, unit_price }) => ({ description, quantity, unit_price })), p_save_client_suggestion: saveClientSuggestion });
    if (error) throw error;
    return data;
  })();
  CREATE_IN_FLIGHT.set(requestKey, request);
  try { return await request; } finally { if (CREATE_IN_FLIGHT.get(requestKey) === request) CREATE_IN_FLIGHT.delete(requestKey); }
}

export async function updatePreAuthorizationAtomic(preauthId: string, payload: Record<string, unknown>, items: StudioItem[], reason = "amended") {
  if (getCareFlowDataMode() === "offline") return updateOfflinePreAuthDraft(preauthId, toReviewInput({ ...withFacility(payload), id: preauthId }, items), payload.doctor_id ? String(payload.doctor_id) : null, reason);
  const existing = UPDATE_IN_FLIGHT.get(preauthId);
  if (existing) return existing;
  const request = (async () => {
    const capturedRevision = readPreAuthorizationEditRevision(preauthId);
    await assertPreAuthorizationRevision(preauthId, capturedRevision);
    const { data, error } = await (supabase.rpc as any)("update_preauthorization_atomic", { p_preauth_id: preauthId, p_payload: withFacility(payload), p_items: items.map(({ description, quantity, unit_price }) => ({ description, quantity, unit_price })), p_reason: reason });
    if (error) throw error;
    clearPreAuthorizationEditRevision(preauthId);
    return data;
  })();
  UPDATE_IN_FLIGHT.set(preauthId, request);
  try { return await request; } finally { if (UPDATE_IN_FLIGHT.get(preauthId) === request) UPDATE_IN_FLIGHT.delete(preauthId); }
}

export function getPreAuthorizationErrorMessage(error: unknown): string {
  const message = String((error as { message?: string })?.message || error || "");
  if (message.includes("PREAUTH_REVISION_CONFLICT")) return "This pre-authorization was changed elsewhere while you were editing it. Your changes are still on screen. Review the current server version before saving again.";
  if (message.includes("DUPLICATE_PREAUTH")) return "A matching pre-authorization already exists. Review the existing request before creating another one.";
  if (message.includes("TOTAL_COST_MISMATCH")) return "The submitted total does not match the charge lines. Recheck the quantities and unit charges.";
  if (message.includes("PREAUTH_ITEMS_REQUIRED")) return "Add at least one valid service or charge line.";
  if (message.includes("CLIENT_NAME_REQUIRED")) return "Client name is required.";
  if (message.includes("INSURER_NAME_REQUIRED")) return "Insurer name is required.";
  if (message.includes("FACILITY_REQUIRED")) return "Select a facility before saving the request.";
  if (message.includes("FACILITY_ACCESS_DENIED")) return "You do not have access to the selected facility.";
  if (message.includes("CHARGE_DESCRIPTION_REQUIRED")) return "Every charge line must have a description.";
  if (message.includes("INVALID_CHARGE_VALUE")) return "Charge quantities and unit prices contain an invalid value.";
  return message || "Unable to save the pre-authorization.";
}
