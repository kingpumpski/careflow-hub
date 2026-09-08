import { useEffect, useState } from "react";
import { CloudOff, CloudUpload, Wifi } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getPendingSyncCount, syncPendingOperations } from "@/modules/offline/sync-queue";
import { startAutomaticSync, useConnectivity } from "@/modules/offline/connectivity";
import { getConfiguredDataMode } from "@/modules/offline/data-mode";

export function CareFlowRuntime() {
  const connectivity = useConnectivity();
  const [pending, setPending] = useState(0);

  useEffect(() => startAutomaticSync(), []);
  useEffect(() => {
    let active = true;
    const refresh = async () => { const count = await getPendingSyncCount(); if (active) setPending(count); };
    void refresh();
    const timer = window.setInterval(refresh, 5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [connectivity]);

  const configured = getConfiguredDataMode();
  const hybrid = configured === "hybrid";
  const offline = connectivity === "offline" || configured === "offline";

  return (
    <div className="fixed bottom-3 right-3 z-50">
      <Badge variant="outline" className="gap-1.5 bg-background/95 shadow-sm">
        {offline ? <CloudOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
        {offline ? "Offline — working locally" : hybrid ? "Online — sync enabled" : "Online"}
        {pending > 0 && <><CloudUpload className="h-3.5 w-3.5" /> {pending} pending</>}
      </Badge>
    </div>
  );
}
