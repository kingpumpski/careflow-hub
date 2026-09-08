export type CareFlowDataMode = "supabase" | "offline";

/**
 * Supabase remains the default. Internal/offline operation must be an explicit
 * configuration choice so production behavior cannot silently switch stores.
 */
export function getCareFlowDataMode(): CareFlowDataMode {
  return import.meta.env.VITE_CAREFLOW_DATA_MODE === "offline" ? "offline" : "supabase";
}

export function isOfflineMode(): boolean {
  return getCareFlowDataMode() === "offline";
}
