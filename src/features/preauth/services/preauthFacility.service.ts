import { supabase } from "@/integrations/supabase/client";

export interface PreAuthFacility {
  id: string;
  code: string;
  name: string;
  country_code?: string | null;
  timezone: string;
  default_currency: string;
  date_format: string;
  active: boolean;
}

export interface FacilityMembership {
  id: string;
  facility_id: string;
  user_id: string;
  role: string;
  status: string;
  facility?: PreAuthFacility;
}

export async function listMyPreAuthFacilities(): Promise<FacilityMembership[]> {
  const { data, error } = await ((supabase as any).from("facility_memberships"))
    .select("id,facility_id,user_id,role,status,facility:facilities(id,code,name,country_code,timezone,default_currency,date_format,active)")
    .eq("status", "active");
  if (error) throw error;
  return (data ?? []) as FacilityMembership[];
}

export function getStoredFacilityId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("careflow:preauth:facility-id");
}

export function storeFacilityId(id: string): void {
  if (typeof window !== "undefined") window.localStorage.setItem("careflow:preauth:facility-id", id);
}
