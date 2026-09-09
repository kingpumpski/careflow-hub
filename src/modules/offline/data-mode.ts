import { useEffect, useState } from "react";

export type CareFlowDataMode = "supabase" | "offline";
export type CareFlowConfiguredMode = "hybrid" | CareFlowDataMode;

const CONNECTIVITY_EVENT = "careflow:supabase-connectivity";
const FALLBACK_SUPABASE_URL = "https://jajfdgknctzqypdtvmxo.supabase.co";
const FALLBACK_SUPABASE_KEY = "sb_publishable_t0MoAS6_gg7y6nIA7cjJ2g_q1BihZMR";
let supabaseReachable: boolean | null = null;
let probeInFlight: Promise<boolean> | null = null;

function getSupabaseUrl(): string {
  return String(import.meta.env.VITE_SUPABASE_URL || FALLBACK_SUPABASE_URL);
}

function getSupabasePublishableKey(): string {
  return String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || FALLBACK_SUPABASE_KEY);
}

export function getConfiguredDataMode(): CareFlowConfiguredMode {
  const configured = String(import.meta.env.VITE_CAREFLOW_DATA_MODE || "hybrid").toLowerCase();
  if (configured === "supabase" || configured === "offline") return configured;
  return "hybrid";
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabasePublishableKey());
}

export function getSupabaseReachability(): boolean | null {
  return supabaseReachable;
}

function notifyReachability(value: boolean): void {
  const changed = supabaseReachable !== value;
  supabaseReachable = value;
  if (changed && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<boolean>(CONNECTIVITY_EVENT, { detail: value }));
  }
}

/**
 * Checks the actual Supabase service instead of trusting navigator.onLine.
 * A reachable internet connection without a reachable/configured Supabase
 * service must remain in offline mode for operational data access.
 */
export async function probeSupabaseReachability(timeoutMs = 5_000): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    notifyReachability(false);
    return false;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    notifyReachability(false);
    return false;
  }
  if (probeInFlight) return probeInFlight;

  probeInFlight = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `${getSupabaseUrl().replace(/\/$/, "")}/auth/v1/health`;
      const response = await fetch(url, {
        method: "GET",
        headers: { apikey: getSupabasePublishableKey() },
        cache: "no-store",
        signal: controller.signal,
      });
      const reachable = response.ok || response.status === 401 || response.status === 403;
      notifyReachability(reachable);
      return reachable;
    } catch {
      notifyReachability(false);
      return false;
    } finally {
      window.clearTimeout(timeout);
      probeInFlight = null;
    }
  })();

  return probeInFlight;
}

/** Hybrid mode uses Supabase only after an actual service reachability check. */
export function getCareFlowDataMode(): CareFlowDataMode {
  const configured = getConfiguredDataMode();
  if (configured !== "hybrid") return configured;
  return typeof navigator !== "undefined" && navigator.onLine && isSupabaseConfigured() && supabaseReachable === true
    ? "supabase"
    : "offline";
}

export function isOfflineMode(): boolean { return getCareFlowDataMode() === "offline"; }

export function useCareFlowDataMode(): CareFlowDataMode {
  const [mode, setMode] = useState<CareFlowDataMode>(getCareFlowDataMode());
  useEffect(() => {
    const refresh = () => setMode(getCareFlowDataMode());
    const handleReachability = () => refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    window.addEventListener(CONNECTIVITY_EVENT, handleReachability);
    void probeSupabaseReachability();
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener(CONNECTIVITY_EVENT, handleReachability);
    };
  }, []);
  return mode;
}
