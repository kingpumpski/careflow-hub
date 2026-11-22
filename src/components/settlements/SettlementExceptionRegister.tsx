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

type SettlementPeriodInput = {
  id?: string;
  facility_id?: string;
  period_end?: string;
  total_claims_submitted?: number | string | null;
  settlement_status?: string;
  payment_received?: number | null;
  rejection_amount?: number | null;
  actual_withholding_tax?: number | null;
  withholding_tax_variance?: number | null;
  payment_advice_reference?: string | null;
  payment_advice_date?: string | null;
};

type SettlementExceptionRow = {
  id: string;
  facility_id: string;
  settlement_period_id: string;
  type: SettlementException["type"];
  severity: SettlementException["severity"];
  status: SettlementExceptionStatus;
  title: string;
  description: string;
  detected_at: string;
  assigned_to?: string | null;
  resolution_note?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
};

function toExceptionRow(row: SettlementExceptionRow): SettlementException {
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

const callSettlementRpc = (
  name: string,
  args: Record<string, unknown>,
): Promise<{ error: { message: string } | null }> =>
  (supabase.rpc as unknown as (
    functionName: string,
    parameters: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>)(name, args);

export default function SettlementExceptionRegister({ periods }: { periods: SettlementPeriodInput[] }) {
  const { user } = useAuth();
  const { can, loading: permissionsLoading } = usePermissions();
  const queryClient = useQueryClient();
  const offline = getCareFlowDataMode() === "offline";
  const canRead = !permissionsLoading && can("payments.read");
  const canWrite = canRead && can("payments.write");
  const [offlineExceptions, setOfflineExceptions] = useState<SettlementException[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Do not issue a PostgREST request until the permission check has completed.
  // RLS remains the server-side boundary; this avoids unnecessary unauthorized reads.
  const onlineQuery = useSupabaseQuery("settlement_exceptions", { orderBy: "detected_at", enabled: !offline && canRead });
  const exceptions = offline ? offlineExceptions : ((onlineQuery.data ?? []) as SettlementExceptionRow[]).map(toExceptionRow);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!canRead) {
        setError("You need payments.read permission to view settlement exceptions.");
        return;
      }
      if (offline) {
        await syncOfflineSettlementExceptions(periods);
        setOfflineExceptions(await listOfflineSettlementExceptions());
      } else if (!canWrite) {
        await queryClient.invalidateQueries({ queryKey: ["settlement_exceptions"] });
      } else {
        for (const period of periods) {
          if (!period.facility_id || !period.id || !period.period_end || !period.settlement_status) continue;
          const candidates = detectSettlementExceptions({
            id: period.id,
            facilityId: period.facility_id,
            periodEnd: period.period_end,
            totalClaimsSubmitted: Number(period.total_claims_submitted ?? 0),
            settlementStatus: period.settlement_status as "awaiting_payment" | "payment_advice_received" | "reconciled",
            paymentReceived: period.payment_received ?? null,
            rejectionAmount: period.rejection_amount ?? null,
            actualWithholdingTax: period.actual_withholding_tax ?? null,
            withholdingTaxVariance: period.withholding_tax_variance ?? null,
            paymentAdviceReference: period.payment_advice_reference ?? null,
            paymentAdviceDate: period.payment_advice_date ?? null,
          });
          for (const candidate of candidates) {
            const { error: rpcError } = await callSettlementRpc("record_settlement_exception", {
              p_settlement_period_id: candidate.settlementPeriodId,
              p_type: candidate.type,
              p_severity: candidate.severity,
              p_title: candidate.title,
              p_description: candidate.description,
            });
            if (rpcError) throw new Error(rpcError.message);
          }
        }
        await queryClient.invalidateQueries({ queryKey: ["settlement_exceptions"] });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to synchronize settlement exceptions.");
    } finally {
      setIsLoading(false);
    }
  }, [offline, periods, canRead, canWrite, queryClient]);

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
    if (!canWrite) { setError("You need payments.read and payments.write permissions to update settlement exceptions."); return; }
    const note = window.prompt(status === "under_review" ? "Enter the review note:" : "Enter the resolution/waiver note:");
    if (!note?.trim()) return;
    setBusyId(id);
    setError(null);
    try {
      if (offline) {
        await updateOfflineSettlementExceptionStatus(id, status, user.id, note);
        setOfflineExceptions(await listOfflineSettlementExceptions());
      } else {
        const { error: rpcError } = await callSettlementRpc("transition_settlement_exception_atomic", {
          p_exception_id: id,
          p_target_status: status,
          p_note: note.trim(),
        });
        if (rpcError) throw new Error(rpcError.message);
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
    {!canRead ? <div role="alert" className="rounded-md border p-5 text-sm text-muted-foreground">Payments read permission is required to view settlement exceptions.</div> : isLoading || (!offline && onlineQuery.isLoading) ? <p className="text-sm text-muted-foreground">Synchronizing settlement exceptions…</p> : !active.length ? <div className="rounded-md border p-5 text-sm text-muted-foreground">No open settlement exceptions detected.</div> : <div className="space-y-3">{active.map((row) => <div key={row.id} className="rounded-md border p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="space-y-1"><div className="flex flex-wrap items-center gap-2"><Badge variant={row.severity === "critical" ? "destructive" : row.severity === "warning" ? "outline" : "secondary"}>{row.severity}</Badge><Badge variant="outline">{String(row.status).replace(/_/g, " ")}</Badge><span className="text-sm font-medium">{row.title}</span></div><p className="text-sm text-muted-foreground">{row.description}</p><p className="text-xs text-muted-foreground">Detected {new Date(row.detectedAt).toLocaleString()}</p></div><div className="flex flex-wrap gap-2">{row.status === "open" && <Button size="sm" variant="outline" disabled={!canWrite || busyId === row.id} onClick={() => void changeStatus(row.id, "under_review")}><ClipboardCheck className="mr-1 h-4 w-4" />Review</Button>}{row.status === "under_review" && <Button size="sm" disabled={!canWrite || busyId === row.id} onClick={() => void changeStatus(row.id, "resolved")}><CheckCircle2 className="mr-1 h-4 w-4" />Resolve</Button>}{(row.status === "open" || row.status === "under_review") && <Button size="sm" variant="ghost" disabled={!canWrite || busyId === row.id} onClick={() => void changeStatus(row.id, "waived")}>Waive</Button>}</div></div>{row.resolutionNote && <p className="mt-3 text-xs text-muted-foreground">Last note: {row.resolutionNote}</p>}</div>)}</div>}
    {canRead && !canWrite && <p className="text-xs text-muted-foreground">Read-only view. Payments write permission is required to review, resolve or waive an exception.</p>}
  </section>;
}
