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

export interface PreAuthDedupItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

const clean = (value?: string | null) => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

export const normalizePreAuthIdentity = (client: PreAuthClientIdentity, insurance: PreAuthInsuranceIdentity) => ({
  client_name: client.name.trim(), client_date_of_birth: client.dateOfBirth || null,
  client_phone: clean(client.phone), client_email: clean(client.email), client_address: clean(client.address),
  client_identifier: clean(client.identifier), client_membership_number: clean(client.membershipNumber),
  patient_id: client.patientId || null, insurer_name: insurance.name.trim(),
  insurer_member_number: clean(insurance.memberNumber), insurer_plan_name: clean(insurance.planName),
  insurer_phone: clean(insurance.phone), insurer_email: clean(insurance.email), insurer_policy_reference: clean(insurance.policyReference),
  insurance_company_id: insurance.insurerId || null,
});

export async function findDuplicatePreAuthorization(input: {
  client: PreAuthClientIdentity; insurance: PreAuthInsuranceIdentity;
  doctorId?: string | null; procedureId?: string | null; procedureDate?: string | null;
  diagnosis?: string | null; totalCost?: number; items: PreAuthDedupItem[]; excludeId?: string | null;
}) {
  const payload = normalizePreAuthIdentity(input.client, input.insurance);
  const { data, error } = await (supabase.rpc as any)("find_duplicate_preauthorization_text_first", {
    p_patient_id: payload.patient_id, p_client_name: payload.client_name, p_client_date_of_birth: payload.client_date_of_birth,
    p_client_identifier: payload.client_identifier, p_client_membership_number: payload.client_membership_number,
    p_insurance_company_id: payload.insurance_company_id, p_insurer_name: payload.insurer_name,
    p_insurer_member_number: payload.insurer_member_number, p_insurer_plan_name: payload.insurer_plan_name,
    p_insurer_policy_reference: payload.insurer_policy_reference, p_doctor_id: input.doctorId || null,
    p_procedure_id: input.procedureId || null, p_procedure_date: input.procedureDate || null,
    p_diagnosis: clean(input.diagnosis), p_total_cost: Number(input.totalCost || 0),
    p_items: input.items.map((item) => ({ description: item.description.trim(), quantity: Number(item.quantity), unit_price: Number(item.unit_price), amount: Number(item.amount) })),
    p_exclude_id: input.excludeId || null,
  });
  if (error) throw error;
  return Array.isArray(data) && data.length ? data[0] : null;
}

export async function searchPreAuthClientSuggestions(query: string, limit = 8) {
  const q = query.trim();
  if (!q) return [];
  const normalized = q.toLowerCase().replace(/\s+/g, " ");
  const { data, error } = await (supabase.from("preauth_client_suggestions") as any)
    .select("id,client_name,date_of_birth,phone,email,address,identifier,membership_number,source_patient_id,use_count,last_used_at")
    .or(`normalized_name.ilike.%${normalized}%,membership_number.ilike.%${q}%,phone.ilike.%${q}%`)
    .order("last_used_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

export async function createPreAuthorizationAtomic(payload: Record<string, unknown>, items: PreAuthDedupItem[], saveClientSuggestion = true) {
  const normalizedItems = items.map((item) => ({
    description: item.description.trim(), quantity: Number(item.quantity), unit_price: Number(item.unit_price),
    amount: Number(item.amount),
  }));
  const { data, error } = await (supabase.rpc as any)("create_preauthorization_atomic", {
    p_payload: payload, p_items: normalizedItems, p_save_client_suggestion: saveClientSuggestion,
  });
  if (error) throw error;
  return data;
}
