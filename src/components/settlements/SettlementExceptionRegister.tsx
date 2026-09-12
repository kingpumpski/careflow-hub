import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { syncOfflineSettlementExceptions } from "@/modules/offline/settlement-exception-sync";
import { updateOfflineSettlementExceptionStatus } from "@/modules/offline/settlement-exception-repository";
import { getCareFlowDataMode } from "@/modules/offline/data-mode";
import type { SettlementExceptionStatus } from "@/features/settlements/domain/settlement-exceptions";
import { useQueryClient } from "@tanstack/react-query";

export default function SettlementExceptionRegister({ periods }: { periods: any[] }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const offline = getCareFlowDataMode() === "offline";
  const { data: exceptions = [], isLoading } = useSupabaseQuery("settlement_exceptions", {
    orderBy: "detectedAt",
    enabled: offline,
  });
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!offline) return;
    void syncOfflineSettlementExceptions(periods).then(() => queryClient.invalidateQueries({ queryKey: ["settlement_exceptions"] }));
  }, [periods, queryClient, offline]);

  const active = useMemo(() => exceptions.filter((row: any) => row.status !== "resolved" && row.status !== "waived"), [exceptions]);
  const counts = useMemo(() => ({
    critical: active.filter((row: any) => row.severity === "critical").length,
    warning: active.filter((row: any) => row.severity === "warning").length,
    info: active.filter((row: any) => row.severity === "info").length,
  }), [active]);

  const changeStatus = async (id: string, status: SettlementExceptionStatus) => {
    if (!user?.id) return;
    const note = window.prompt(status === "under_review" ? "Enter the review note:" : "Enter the resolution/waiver note:");
    if (!note?.trim()) return;
    setBusyId(id);
    try {
      await updateOfflineSettlementExceptionStatus(id, status, user.id, note);
      await queryClient.invalidateQueries({ queryKey: ["settlement_exceptions"] });
    } finally {
      setBusyId(null);
    }
  };

  if (!offline) return null;

  return <section className="stat-card space-y-4">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div><div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /><h2 className="font-semibold">Settlement exception register</h2></div><p className="text-sm text-muted-foreground">Operational exceptions are tracked locally with an immutable status-change audit trail.</p></div>
      <div className="flex flex-wrap gap-2"><Badge variant="destructive">Critical {counts.critical}</Badge><Badge variant="outline">Warning {counts.warning}</Badge><Badge variant="secondary">Info {counts.info}</Badge></div>
    </div>
    {isLoading ? <p className="text-sm text-muted-foreground">Checking settlement exceptions…</p> : !active.length ? <div className="rounded-md border p-5 text-sm text-muted-foreground">No open settlement exceptions detected.</div> : <div className="space-y-3">{active.map((row: any) => <div key={row.id} className="rounded-md border p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="space-y-1"><div className="flex flex-wrap items-center gap-2"><Badge variant={row.severity === "critical" ? "destructive" : row.severity === "warning" ? "outline" : "secondary"}>{row.severity}</Badge><Badge variant="outline">{String(row.status).replace(/_/g, " ")}</Badge><span className="text-sm font-medium">{row.title}</span></div><p className="text-sm text-muted-foreground">{row.description}</p><p className="text-xs text-muted-foreground">Detected {new Date(row.detectedAt).toLocaleString()}</p></div><div className="flex flex-wrap gap-2">{row.status === "open" && <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => void changeStatus(row.id, "under_review")}><ClipboardCheck className="mr-1 h-4 w-4" />Review</Button>}{(row.status === "open" || row.status === "under_review") && <><Button size="sm" disabled={busyId === row.id} onClick={() => void changeStatus(row.id, "resolved")}><CheckCircle2 className="mr-1 h-4 w-4" />Resolve</Button><Button size="sm" variant="ghost" disabled={busyId === row.id} onClick={() => void changeStatus(row.id, "waived")}>Waive</Button></>}</div></div></div>)}</div>}
  </section>;
}
