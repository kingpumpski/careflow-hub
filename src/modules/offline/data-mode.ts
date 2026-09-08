export type CareFlowDataMode = "supabase" | "offline";

/**
 * CareFlow is operated internally against the IndexedDB/Excel bridge by default.
 * Supabase remains an explicit integration mode so the department never depends
 * on the remote database being available during day-to-day operations.
 */
export function getCareFlowDataMode(): CareFlowDataMode {
  return import.meta.env.VITE_CAREFLOW_DATA_MODE === "supabase" ? "supabase" : "offline";
}

export function isOfflineMode(): boolean {
  return getCareFlowDataMode() === "offline";
}
