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

export const normalizePreAuthIdentity = (
  client: PreAuthClientIdentity,
  insurance: PreAuthInsuranceIdentity,
) => ({
  client_name: client.name.trim(),
  client_date_of_birth: client.dateOfBirth || null,
  client_phone: clean(client.phone),
  client_email: clean(client.email),
  client_address: clean(client.address),
  client_identifier: clean(client.identifier),
  client_membership_number: clean(client.membershipNumber),
  patient_id: client.patientId || null,
  insurer_name: insurance.name.trim(),
  insurer_member_number: clean(insurance.memberNumber),
  insurer_plan_name: clean(insurance.planName),
  insurer_phone: clean(insurance.phone),
  insurer_email: clean(insurance.email),
  insurer_policy_reference: clean(insurance.policyReference),
  insurance_company_id: insurance.insurerId || null,
});

export async function findDuplicatePreAuthorization(input: {
  patientId?: string | null;
  insurerId?: string | null;
  doctorId?: string | null;
  procedureId?: string | null;
  procedureDate?: string | null;
  diagnosis?: string | null;
  items: PreAuthDedupItem[];
  excludeId?: string | null;
}) {
  const { data, error } = await (supabase.rpc as any)("find_duplicate_preauthorization", {
    p_patient_id: input.patientId || null,
    p_insurance_company_id: input.insurerId || null,
    p_doctor_id: input.doctorId || null,
    p_procedure_id: input.procedureId || null,
    p_procedure_date: input.procedureDate || null,
    p_diagnosis: clean(input.diagnosis),
    p_items: input.items.map((item) => ({
      description: item.description.trim(),
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      amount: Number(item.amount),
    })),
    p_exclude_id: input.excludeId || null,
  });

  if (error) throw error;
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}
