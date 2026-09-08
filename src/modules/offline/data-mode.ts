import { useEffect, useState } from "react";

export type CareFlowDataMode = "supabase" | "offline";
export type CareFlowConfiguredMode = "hybrid" | CareFlowDataMode;

/**
 * Hybrid is the recommended deployment mode. IndexedDB remains the local
 * operational store while connectivity determines whether remote operations
 * are currently available. Explicit offline/supabase values remain supported
 * for controlled deployments and testing.
 */
export function getConfiguredDataMode(): CareFlowConfiguredMode {
  const configured = String(import.meta.env.VITE_CAREFLOW_DATA_MODE || "hybrid").toLowerCase();
  if (configured === "supabase" || configured === "offline") return configured;
  return "hybrid";
}

export function getCareFlowDataMode(): CareFlowDataMode {
  const configured = getConfiguredDataMode();
  if (configured !== "hybrid") return configured;
  return typeof navigator !== "undefined" && navigator.onLine ? "supabase" : "offline";
}

export function isOfflineMode(): boolean {
  return getCareFlowDataMode() === "offline";
}

export function useCareFlowDataMode(): CareFlowDataMode {
  const [mode, setMode] = useState<CareFlowDataMode>(getCareFlowDataMode());
  useEffect(() => {
    const refresh = () => setMode(getCareFlowDataMode());
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => { window.removeEventListener("online", refresh); window.removeEventListener("offline", refresh); };
  }, []);
  return mode;
}
