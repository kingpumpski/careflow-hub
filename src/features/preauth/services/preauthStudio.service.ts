import { supabase } from "@/integrations/supabase/client";
import { getStoredFacilityId } from "./preauthFacility.service";

export interface ClientSuggestion {
  id: string;
  client_name: string;
  date_of_birth?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  identifier?: string | null;
  membership_number?: string | null;
  use_count?: number;
  last_used_at?: string;
}

export interface StudioItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, (match) => `\\${match}`);
}

export async function searchClientSuggestions(query: string, limit = 12): Promise<ClientSuggestion[]> {
  const q = query.trim();
  if (limit < 1 || limit > 50) throw new Error("Suggestion limit must be between 1 and 50");
  const facilityId = getStoredFacilityId();
  if (!facilityId) return [];

  let request = (supabase.from("preauth_client_suggestions") as any)
    .select("id,client_name,date_of_birth,phone,email,address,identifier,membership_number,use_count,last_used_at")
    .eq("facility_id", facilityId)
    .order("last_used_at", { ascending: false })
    .limit(limit);

  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    request = request.or(
      `normalized_name.ilike.${pattern},membership_number.ilike.${pattern},phone.ilike.${pattern},identifier.ilike.${pattern}`,
    );
  }

  const { data, error } = await request;
  if (error) throw error;
  return (data || []) as ClientSuggestion[];
}

function withFacility(payload: Record<string, unknown>): Record<string, unknown> {
  const facilityId = getStoredFacilityId();
  if (!facilityId && !payload.facility_id) throw new Error("Select a facility before creating a pre-authorization.");
  return { ...payload, facility_id: payload.facility_id || facilityId };
}

export async function createPreAuthorizationAtomic(
  payload: Record<string, unknown>,
  items: StudioItem[],
  saveClientSuggestion: boolean,
) {
  const { data, error } = await (supabase.rpc as any)("create_preauthorization_atomic", {
    p_payload: withFacility(payload),
    p_items: items.map(({ description, quantity, unit_price }) => ({ description, quantity, unit_price })),
    p_save_client_suggestion: saveClientSuggestion,
  });
  if (error) throw error;
  return data;
}

export async function updatePreAuthorizationAtomic(
  preauthId: string,
  payload: Record<string, unknown>,
  items: StudioItem[],
  reason = "amended",
) {
  const { data, error } = await (supabase.rpc as any)("update_preauthorization_atomic", {
    p_preauth_id: preauthId,
    p_payload: withFacility(payload),
    p_items: items.map(({ description, quantity, unit_price }) => ({ description, quantity, unit_price })),
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}

export function getPreAuthorizationErrorMessage(error: unknown): string {
  const message = String((error as { message?: string })?.message || error || "");
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
