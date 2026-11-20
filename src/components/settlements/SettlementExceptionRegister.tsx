import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { syncOfflineSettlementExceptions } from "@/modules/offline/settlement-exception-sync";
import { listOfflineSettlementExceptions, updateOfflineSettlementExceptionStatus } from "@/modules/offline/settlement-exception-repository";
import { getCareFlowDataMode } from "@/modules/offline/data-mode";
import { detectSettlementExceptions, type SettlementException, type SettlementExceptionStatus } from "@/features/settlements/domain/settlement-exceptions";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { usePermissions } from "@/modules/security/usePermissions";
import { useQueryClient } from "@tanstack/react-query";

function toExceptionRow(row: any): SettlementException {
  return {
    id: row.id,
    facilityId: row.facility_id,
    settlementPeriodId: row.settlement_period_id,
    type: row.type,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description,
    detectedAt: row.detected_at,
    assignedTo: row.assigned_to ?? null,
    resolutionNote: row.resolution_note ?? null,
    resolvedAt: row.resolved_at ?? null,
    resolvedBy: row.resolved_by ?? null,
  };
}

export default function SettlementExceptionRegister({ periods }: { periods: any[] }) {
  const { user } = useAuth();
  const { can, loading: permissionsLoading } = usePermissions();
  const queryClient = useQueryClient();
  const offline = getCareFlowDataMode() === "offline";
  const canWrite = !permissionsLoading && can("payments.write");
  const [offlineExceptions, setOfflineExceptions] = useState<SettlementException[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onlineQuery = useSupabaseQuery("settlement_exceptions", { orderBy: "detected_at", enabled: !offline });
  const exceptions = offline ? offlineExceptions : ((onlineQuery.data ?? []) as any[]).map(toExceptionRow);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (offline) {
        await syncOfflineSettlementExceptions(periods);
        setOfflineExceptions(await listOfflineSettlementExceptions());
      } else {
        if (!canWrite) {
          await queryClient.invalidateQueries({ queryKey: ["settlement_exceptions"] });
        } else {
          for (const period of periods) {
            if (!period.facility_id || !period.id) continue;
            const candidates = detectSettlementExceptions({
              id: period.id,
              facilityId: period.facility_id,
              periodEnd: period.period_end,
              totalClaimsSubmitted: Number(period.total_claims_submitted ?? 0),
              settlementStatus: period.settlement_status,
              paymentReceived: period.payment_received ?? null,
              rejectionAmount: period.rejection_amount ?? null,
              actualWithholdingTax: period.actual_withholding_tax ?? null,
              withholdingTaxVariance: period.withholding_tax_variance ?? null,
              paymentAdviceReference: period.payment_advice_reference ?? null,
              paymentAdviceDate: period.payment_advice_date ?? null,
            });
            for (const candidate of candidates) {
              const { error: rpcError } = await (supabase as any).rpc("record_settlement_exception", {
                p_settlement_period_id: candidate.settlementPeriodId,
                p_type: candidate.type,
                p_severity: candidate.severity,
                p_title: candidate.title,
                p_description: candidate.description,
                p_detected_at: candidate.detectedAt,
              });
              if (rpcError) throw rpcError;
            }
          }
          await queryClient.invalidateQueries({ queryKey: ["settlement_exceptions"] });
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to synchronize settlement exceptions.");
    } finally {
      setIsLoading(false);
    }
  }, [offline, periods, canWrite, queryClient]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const active = useMemo(() => exceptions.filter((row) => row.status !== "resolved" && row.status !== "waived"), [exceptions]);
  const counts = useMemo(() => ({
    critical: active.filter((row) => row.severity === "critical").length,
    warning: active.filter((row) => row.severity === "warning").length,
    info: active.filter((row) => row.severity === "info").length,
  }), [active]);

  const changeStatus = async (id: string, status: SettlementExceptionStatus) => {
    if (!user?.id) { setError("Sign in again before changing a settlement exception."); return; }
    if (!canWrite) { setError("You need payments.write permission to update settlement exceptions."); return; }
    const note = window.prompt(status === "under_review" ? "Enter the review note:" : "Enter the resolution/waiver note:");
    if (!note?.trim()) return;
    setBusyId(id);
    setError(null);
    try {
      if (offline) {
        await updateOfflineSettlementExceptionStatus(id, status, user.id, note);
        setOfflineExceptions(await listOfflineSettlementExceptions());
      } else {
        const { error: rpcError } = await (supabase as any).rpc("transition_settlement_exception_atomic", {
          p_exception_id: id,
          p_target_status: status,
          p_note: note.trim(),
        });
        if (rpcError) throw rpcError;
        await queryClient.invalidateQueries({ queryKey: ["settlement_exceptions"] });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update settlement exception.");
    } finally {
      setBusyId(null);
    }
  };

  return <section className="stat-card space-y-4">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div><div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /><h2 className="font-semibold">Settlement exception register</h2></div><p className="text-sm text-muted-foreground">{offline ? "Offline exceptions are stored locally and retain an immutable status-change audit trail; queued changes sync when connectivity returns." : "Online exceptions are detected from settlement periods and recorded with server-side atomic audit events."}</p></div>
      <div className="flex flex-wrap items-center gap-2"><Badge variant="destructive">Critical {counts.critical}</Badge><Badge variant="outline">Warning {counts.warning}</Badge><Badge variant="secondary">Info {counts.info}</Badge><Button size="sm" variant="outline" disabled={isLoading} onClick={() => void refresh()}><RefreshCw className={`mr-1 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />Refresh</Button></div>
    </div>
    {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
    {isLoading || (!offline && onlineQuery.isLoading) ? <p className="text-sm text-muted-foreground">Synchronizing settlement exceptions…</p> : !active.length ? <div className="rounded-md border p-5 text-sm text-muted-foreground">No open settlement exceptions detected.</div> : <div className="space-y-3">{active.map((row) => <div key={row.id} className="rounded-md border p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="space-y-1"><div className="flex flex-wrap items-center gap-2"><Badge variant={row.severity === "critical" ? "destructive" : row.severity === "warning" ? "outline" : "secondary"}>{row.severity}</Badge><Badge variant="outline">{String(row.status).replace(/_/g, " ")}</Badge><span className="text-sm font-medium">{row.title}</span></div><p className="text-sm text-muted-foreground">{row.description}</p><p className="text-xs text-muted-foreground">Detected {new Date(row.detectedAt).toLocaleString()}</p></div><div className="flex flex-wrap gap-2">{row.status === "open" && <Button size="sm" variant="outline" disabled={!canWrite || busyId === row.id} onClick={() => void changeStatus(row.id, "under_review")}><ClipboardCheck className="mr-1 h-4 w-4" />Review</Button>}{row.status === "under_review" && <Button size="sm" disabled={!canWrite || busyId === row.id} onClick={() => void changeStatus(row.id, "resolved")}><CheckCircle2 className="mr-1 h-4 w-4" />Resolve</Button>}{(row.status === "open" || row.status === "under_review") && <Button size="sm" variant="ghost" disabled={!canWrite || busyId === row.id} onClick={() => void changeStatus(row.id, "waived")}>Waive</Button>}</div></div>{row.resolutionNote && <p className="mt-3 text-xs text-muted-foreground">Last note: {row.resolutionNote}</p>}</div>)}</div>}
    {!canWrite && <p className="text-xs text-muted-foreground">Read-only view. Payments write permission is required to review, resolve or waive an exception.</p>}
  </section>;
}
