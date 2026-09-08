import { useEffect, useState } from "react";
import { probeSupabaseReachability } from "./data-mode";
import { syncPendingOperations } from "./sync-queue";

export type ConnectivityState = "online" | "offline";

export function isNetworkOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

async function syncWhenServiceReachable(): Promise<void> {
  if (!(await probeSupabaseReachability())) return;
  await syncPendingOperations();
}

export function useConnectivity(): ConnectivityState {
  const [state, setState] = useState<ConnectivityState>(isNetworkOnline() ? "online" : "offline");

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      const reachable = await probeSupabaseReachability();
      if (active) setState(reachable ? "online" : "offline");
      if (reachable) await syncPendingOperations();
    };

    const goOnline = () => { void refresh(); };
    const goOffline = () => setState("offline");

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    void refresh();

    return () => {
      active = false;
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return state;
}

export function startAutomaticSync(intervalMs = 30_000): () => void {
  const run = () => { void syncWhenServiceReachable(); };
  const interval = window.setInterval(run, intervalMs);
  window.addEventListener("online", run);
  run();
  return () => {
    window.clearInterval(interval);
    window.removeEventListener("online", run);
  };
}
