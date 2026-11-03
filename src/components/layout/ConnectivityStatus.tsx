import { useEffect, useState } from "react";
import { AlertTriangle, CloudOff, CloudUpload, RefreshCw, Wifi } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getPendingSyncCount, getSyncConflicts, syncPendingOperations } from "@/modules/offline/sync-queue";
import { getConfiguredDataMode, probeSupabaseReachability, useCareFlowDataMode } from "@/modules/offline/data-mode";

export default function ConnectivityStatus() {
  const mode = useCareFlowDataMode();
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState(0);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const [count, conflictRows] = await Promise.all([getPendingSyncCount(), getSyncConflicts()]);
      if (active) {
        setPending(count);
        setConflicts(conflictRows.length);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [mode]);

  const configured = getConfiguredDataMode();
  const hybrid = configured === "hybrid";
  const offline = mode === "offline" || configured === "offline";

  const checkNow = async () => {
    setChecking(true);
    try {
      if (await probeSupabaseReachability()) await syncPendingOperations();
    } finally {
      setChecking(false);
    }
  };

  return (
    <Badge
      variant={conflicts > 0 ? "destructive" : "outline"}
      className="group flex w-full min-w-0 items-center gap-1.5 overflow-hidden bg-background/95 px-2 py-1.5 text-[10px] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:text-xs"
      title={conflicts > 0 ? "Some offline changes could not be applied because the server record changed. Local work has been preserved." : offline ? "CareFlow is using the local operational database." : "CareFlow is connected to Supabase and can synchronize queued changes."}
    >
      {conflicts > 0 ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> : offline ? <CloudOff className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-hover:scale-110" /> : <Wifi className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-hover:scale-110" />}
      <span className="min-w-0 truncate">{conflicts > 0 ? `${conflicts} sync conflict${conflicts === 1 ? "" : "s"}` : offline ? "Offline - working locally" : hybrid ? "Online - sync enabled" : "Online"}</span>
      {pending > 0 && conflicts === 0 && <><CloudUpload className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-hover:translate-y-[-1px]" /><span className="shrink-0 tabular-nums">{pending} pending</span></>}
      <button
        type="button"
        aria-label="Check online connection"
        onClick={checkNow}
        className="ml-auto shrink-0 rounded-sm p-0.5 transition-transform duration-200 hover:rotate-180 disabled:opacity-50"
        disabled={checking}
      >
        <RefreshCw className={`h-3 w-3 ${checking ? "animate-spin" : ""}`} />
      </button>
    </Badge>
  );
}
