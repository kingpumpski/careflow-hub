import { useEffect, useState } from "react";
import { syncPendingOperations } from "./sync-queue";

export type ConnectivityState = "online" | "offline";

export function isNetworkOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function useConnectivity(): ConnectivityState {
  const [state, setState] = useState<ConnectivityState>(isNetworkOnline() ? "online" : "offline");
  useEffect(() => {
    const goOnline = () => { setState("online"); void syncPendingOperations(); };
    const goOffline = () => setState("offline");
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    if (isNetworkOnline()) void syncPendingOperations();
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, []);
  return state;
}

export function startAutomaticSync(intervalMs = 30_000): () => void {
  const run = () => { if (isNetworkOnline()) void syncPendingOperations(); };
  const interval = window.setInterval(run, intervalMs);
  window.addEventListener("online", run);
  run();
  return () => { window.clearInterval(interval); window.removeEventListener("online", run); };
}
