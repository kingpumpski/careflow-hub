import { useEffect, useState } from "react";
import { CloudOff, CloudUpload, Wifi, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getPendingSyncCount, syncPendingOperations } from "@/modules/offline/sync-queue";
import { startAutomaticSync } from "@/modules/offline/connectivity";
import { getConfiguredDataMode, probeSupabaseReachability, useCareFlowDataMode } from "@/modules/offline/data-mode";

export function CareFlowRuntime() {
  const mode = useCareFlowDataMode();
  const [pending, setPending] = useState(0);
  const [checking, setChecking] = useState(false);

  useEffect(() => startAutomaticSync(), []);
  useEffect(() => {
    let active = true;
    const refresh = async () => { const count = await getPendingSyncCount(); if (active) setPending(count); };
    void refresh();
    const timer = window.setInterval(refresh, 5_000);
    return () => { active = false; window.clearInterval(timer); };
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
    <div className="fixed bottom-3 right-3 z-50">
      <Badge
        variant="outline"
        className="group gap-1.5 bg-background/95 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
        title={offline ? "CareFlow is using the local operational database." : "CareFlow is connected to Supabase and can synchronize queued changes."}
      >
        {offline ? <CloudOff className="h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-110" /> : <Wifi className="h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-110" />}
        {offline ? "Offline — working locally" : hybrid ? "Online — sync enabled" : "Online"}
        {pending > 0 && <><CloudUpload className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-y-[-1px]" /> {pending} pending</>}
        <button
          type="button"
          aria-label="Check online connection"
          onClick={checkNow}
          className="ml-0.5 rounded-sm p-0.5 transition-transform duration-200 hover:rotate-180 disabled:opacity-50"
          disabled={checking}
        >
          <RefreshCw className={`h-3 w-3 ${checking ? "animate-spin" : ""}`} />
        </button>
      </Badge>
    </div>
  );
}
