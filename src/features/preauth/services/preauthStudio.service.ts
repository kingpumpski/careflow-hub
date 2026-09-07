import { supabase } from "@/integrations/supabase/client";

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

export async function searchClientSuggestions(query: string, limit = 12): Promise<ClientSuggestion[]> {
  const q = query.trim();
  let request = (supabase.from("preauth_client_suggestions") as any)
    .select("id,client_name,date_of_birth,phone,email,address,identifier,membership_number,use_count,last_used_at")
    .order("last_used_at", { ascending: false })
    .limit(limit);
  if (q) request = request.ilike("normalized_name", `%${q.toLowerCase()}%`);
  const { data, error } = await request;
  if (error) throw error;
  return data || [];
}

export async function createPreAuthorizationAtomic(payload: Record<string, unknown>, items: StudioItem[], saveClientSuggestion: boolean) {
  const { data, error } = await (supabase.rpc as any)("create_preauthorization_atomic", {
    p_payload: payload,
    p_items: items,
    p_save_client_suggestion: saveClientSuggestion,
  });
  if (error) throw error;
  return data;
}
