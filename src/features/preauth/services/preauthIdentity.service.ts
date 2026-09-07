import { supabase } from "@/integrations/supabase/client";

export interface PreAuthClientIdentity {
  patientId?: string | null;
  name: string;
  dateOfBirth?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  identifier?: string | null;
  membershipNumber?: string | null;
}
export interface PreAuthInsuranceIdentity {
  insurerId?: string | null;
  name: string;
  memberNumber?: string | null;
  planName?: string | null;
  phone?: string | null;
  email?: string | null;
  policyReference?: string | null;
}
export interface PreAuthDedupItem { description: string; quantity: number; unit_price: number; amount: number; }
const clean = (value?: string | null) => { const v = value?.trim(); return v ? v : null; };

export const normalizePreAuthIdentity = (client: PreAuthClientIdentity, insurance: PreAuthInsuranceIdentity) => ({
  client_name: client.name.trim(), client_date_of_birth: client.dateOfBirth || null, client_phone: clean(client.phone),
  client_email: clean(client.email), client_address: clean(client.address), client_identifier: clean(client.identifier),
  client_membership_number: clean(client.membershipNumber), patient_id: client.patientId || null,
  insurer_name: insurance.name.trim(), insurer_member_number: clean(insurance.memberNumber), insurer_plan_name: clean(insurance.planName),
  insurer_phone: clean(insurance.phone), insurer_email: clean(insurance.email), insurer_policy_reference: clean(insurance.policyReference),
  insurance_company_id: insurance.insurerId || null,
});

type DuplicateInput = {
  client?: PreAuthClientIdentity;
  insurance?: PreAuthInsuranceIdentity;
  patientId?: string | null;
  insurerId?: string | null;
  clientName?: string | null;
  clientDateOfBirth?: string | null;
  clientIdentifier?: string | null;
  clientMembershipNumber?: string | null;
  insurerName?: string | null;
  insurerMemberNumber?: string | null;
  insurerPlanName?: string | null;
  insurerPolicyReference?: string | null;
  doctorId?: string | null;
  procedureId?: string | null;
  procedureDate?: string | null;
  diagnosis?: string | null;
  totalCost?: number;
  items: PreAuthDedupItem[];
  excludeId?: string | null;
};

export async function findDuplicatePreAuthorization(input: DuplicateInput) {
  const client = input.client || {
    patientId: input.patientId || null, name: input.clientName || "",
    dateOfBirth: input.clientDateOfBirth || null, identifier: input.clientIdentifier || null,
    membershipNumber: input.clientMembershipNumber || null,
  };
  const insurance = input.insurance || {
    insurerId: input.insurerId || null, name: input.insurerName || "",
    memberNumber: input.insurerMemberNumber || null, planName: input.insurerPlanName || null,
    policyReference: input.insurerPolicyReference || null,
  };
  const payload = normalizePreAuthIdentity(client, insurance);

  const { data, error } = await (supabase.rpc as any)("find_duplicate_preauthorization_text_first", {
    p_client_name: payload.client_name,
    p_client_date_of_birth: payload.client_date_of_birth,
    p_insurer_name: payload.insurer_name,
    p_insurer_member_number: payload.insurer_member_number,
    p_procedure_date: input.procedureDate || null,
    p_procedure_id: input.procedureId || null,
    p_doctor_id: input.doctorId || null,
    p_diagnosis: clean(input.diagnosis),
    p_total_cost: input.totalCost == null ? null : Number(input.totalCost),
    p_exclude_id: input.excludeId || null,
  });
  if (error) {
    // Keep older deployments usable while the text-first migration is rolled out.
    const fallback = await (supabase.rpc as any)("find_duplicate_preauthorization", {
      p_patient_id: payload.patient_id, p_insurance_company_id: payload.insurance_company_id,
      p_doctor_id: input.doctorId || null, p_procedure_id: input.procedureId || null,
      p_procedure_date: input.procedureDate || null, p_diagnosis: clean(input.diagnosis),
      p_items: input.items.map((item) => ({ description: item.description.trim(), quantity: Number(item.quantity), unit_price: Number(item.unit_price), amount: Number(item.amount) })),
      p_exclude_id: input.excludeId || null,
    });
    if (fallback.error) throw error;
    return Array.isArray(fallback.data) && fallback.data.length ? fallback.data[0] : null;
  }
  return Array.isArray(data) && data.length ? data[0] : null;
}

export async function searchPreAuthClientSuggestions(query: string, limit = 8) {
  const q = query.trim();
  if (!q) return [];
  if (limit < 1 || limit > 50) throw new Error("Suggestion limit must be between 1 and 50");
  const safe = q.replace(/[%_\\]/g, "\\$&");
  const { data, error } = await (supabase.from("preauth_client_suggestions") as any)
    .select("id,client_name,date_of_birth,phone,email,address,identifier,membership_number,source_patient_id,use_count,last_used_at")
    .or(`normalized_name.ilike.%${safe}%,membership_number.ilike.%${safe}%,phone.ilike.%${safe}%,identifier.ilike.%${safe}%`)
    .order("last_used_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

export async function createPreAuthorizationAtomic(payload: Record<string, unknown>, items: PreAuthDedupItem[], saveClientSuggestion = true) {
  const { data, error } = await (supabase.rpc as any)("create_preauthorization_atomic", {
    p_payload: payload,
    p_items: items.map((item) => ({ description: item.description.trim(), quantity: Number(item.quantity), unit_price: Number(item.unit_price) })),
    p_save_client_suggestion: saveClientSuggestion,
  });
  if (error) throw error;
  return data;
}
