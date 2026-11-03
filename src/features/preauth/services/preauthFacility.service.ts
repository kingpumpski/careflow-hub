import { supabase } from "@/integrations/supabase/client";
import { isMissingSchemaError, markFacilityInfrastructureUnavailable } from "@/lib/schemaFallback";

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
  if (error) {
    if (isMissingSchemaError(error)) { markFacilityInfrastructureUnavailable(); return []; }
    throw error;
  }
  return (data ?? []) as FacilityMembership[];
}

/** System administrators are not constrained by facility membership. */
export async function listAllActivePreAuthFacilities(): Promise<PreAuthFacility[]> {
  const { data, error } = await ((supabase as any).from("facilities"))
    .select("id,code,name,country_code,timezone,default_currency,date_format,active")
    .eq("active", true)
    .order("name", { ascending: true });
  if (error) {
    // Facility scoping is not provisioned in this environment; administrators
    // keep global access rather than being locked out of the studio.
    if (isMissingSchemaError(error) || (error as { code?: string }).code === "42501" || (error as { message?: string }).message?.includes("infinite recursion")) {
      markFacilityInfrastructureUnavailable();
      return [];
    }
    throw error;
  }
  return (data ?? []) as PreAuthFacility[];
}

export function getStoredFacilityId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("careflow:preauth:facility-id");
}

export function storeFacilityId(id: string): void {
  if (typeof window !== "undefined") window.localStorage.setItem("careflow:preauth:facility-id", id);
}
