import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, PlusCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useSupabaseInsert, useSupabaseQuery, useSupabaseUpdate } from "@/hooks/useSupabaseQuery";
import { useAuth } from "@/contexts/AuthContext";
import { getStoredFacilityId } from "@/features/preauth/services/preauthFacility.service";
import { calculateProvisionalWithholdingTax, isFullCalendarMonth, calculateWithholdingTaxVariance, canReconcileSettlement, parseApprovedWithholdingTaxRate } from "@/features/settlements/domain/settlement";
import SettlementExceptionRegister from "@/components/settlements/SettlementExceptionRegister";
import SettlementManagementReport from "@/components/settlements/SettlementManagementReport";
import { usePermissions } from "@/modules/security/usePermissions";

const emptyForm = { insurerId: "", periodStart: "", periodEnd: "", periodType: "month" as "month" | "quarter" | "custom", totalClaimsSubmitted: "", withholdingTaxRate: "", paymentReceived: "", approvedGrossAmount: "", rejectionAmount: "", actualWithholdingTax: "", paymentAdviceReference: "", paymentAdviceDate: "", receiptDate: "" };
type SettlementRow = Record<string, any>;

export default function ClaimsSettlement() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { can, loading: permissionsLoading } = usePermissions();
  const canReadSettlements = can("payments.read") || can("claims.settlement.read");
  const canWriteSettlements = can("payments.write") || can("claims.settlement.write");
  const settlementEnabled = !permissionsLoading && canReadSettlements;
  const facilityId = getStoredFacilityId();
  const { data: insurers } = useSupabaseQuery("insurance_companies", { enabled: settlementEnabled });
  const { data: periods, isLoading } = useSupabaseQuery("claims_settlement_periods", { orderBy: "period_start", enabled: settlementEnabled });
  const { data: remittances } = useSupabaseQuery("claims_settlement_remittances", { orderBy: "created_at", enabled: settlementEnabled });
  const insertPeriod = useSupabaseInsert("claims_settlement_periods");
  const updatePeriod = useSupabaseUpdate("claims_settlement_periods");
  const [form, setForm] = useState(emptyForm);
  const [adviceId, setAdviceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [insurerFilter, setInsurerFilter] = useState("all");
  const submitted = Number(form.totalClaimsSubmitted) || 0;
  const rate = Number(form.withholdingTaxRate) || 0;
  const provisional = useMemo(() => { try { return calculateProvisionalWithholdingTax(submitted, rate); } catch { return 0; } }, [submitted, rate]);
  const insurerNames = useMemo(() => new Map((insurers || []).map((row: any) => [row.id, row.company_name])), [insurers]);
  const visiblePeriods = useMemo(() => (periods || []).filter((row: SettlementRow) => (statusFilter === "all" || row.settlement_status === statusFilter) && (insurerFilter === "all" || row.insurance_company_id === insurerFilter)), [periods, statusFilter, insurerFilter]);
  const update = (key: keyof typeof emptyForm, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const createPeriod = async () => {
    if (!canWriteSettlements) { toast({ title: "Permission required", description: "You need settlement write permission to record a settlement period.", variant: "destructive" }); return; }
    if (!facilityId) { toast({ title: "Facility context required", description: "Select a facility before recording settlement information.", variant: "destructive" }); return; }
    if (!form.insurerId || !form.periodStart || !form.periodEnd || !form.totalClaimsSubmitted) { toast({ title: "Complete the period details", description: "Insurer, period dates and total claims submitted are required.", variant: "destructive" }); return; }
    let approvedRate: number;
    try { approvedRate = parseApprovedWithholdingTaxRate(form.withholdingTaxRate); }
    catch (error: unknown) { toast({ title: "Invalid approved WHT rate", description: error instanceof Error ? error.message : "Enter a valid approved rate.", variant: "destructive" }); return; }
    if (new Date(form.periodEnd) < new Date(form.periodStart)) { toast({ title: "Invalid period", description: "The period end date cannot be before the start date.", variant: "destructive" }); return; }
    if (form.periodType === "month" && !isFullCalendarMonth(form.periodStart, form.periodEnd)) { toast({ title: "Invalid monthly period", description: "A monthly settlement must start on the first day and end on the last day of the same calendar month so it can appear correctly in monthly claims reporting.", variant: "destructive" }); return; }
    if (!Number.isFinite(submitted) || submitted < 0 || !Number.isFinite(approvedRate) || approvedRate < 0 || approvedRate > 100) { toast({ title: "Invalid settlement values", description: "Claims submitted must be non-negative and WHT rate must be between 0 and 100%.", variant: "destructive" }); return; }
    setBusy(true);
    try {
      await insertPeriod.mutateAsync({ facility_id: facilityId, insurance_company_id: form.insurerId, period_start: form.periodStart, period_end: form.periodEnd, period_type: form.periodType, total_claims_submitted: submitted, withholding_tax_rate: approvedRate, settlement_status: "awaiting_payment" });
      setForm(emptyForm);
      toast({ title: "Settlement period recorded", description: `Provisional WHT: ${provisional.toFixed(2)}. This is an estimate only.` });
    } catch (error: any) { toast({ title: "Unable to save period", description: error.message || "Please try again.", variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const recordAdvice = async (row: SettlementRow) => {
    if (!canWriteSettlements) { toast({ title: "Permission required", description: "You need settlement write permission to record payment advice.", variant: "destructive" }); return; }
    if (!form.paymentReceived || !form.approvedGrossAmount || !form.rejectionAmount || !form.actualWithholdingTax || !form.paymentAdviceReference.trim() || !form.paymentAdviceDate) {
      toast({ title: "Complete payment advice details", description: "Approved gross, rejected amount, net cash, actual WHT, advice reference and advice date are required.", variant: "destructive" }); return;
    }
    const payment = Number(form.paymentReceived);
    const approved = Number(form.approvedGrossAmount);
    const rejection = Number(form.rejectionAmount);
    const actual = Number(form.actualWithholdingTax);
    if (![payment, approved, rejection, actual].every((value) => Number.isFinite(value) && value >= 0)) {
      toast({ title: "Invalid payment advice figures", description: "Approved gross, rejection, actual WHT and net cash must be non-negative numbers.", variant: "destructive" }); return;
    }
    if (payment > 0 && !form.receiptDate) {
      toast({ title: "Actual receipt date required", description: "Enter the date the net cash was actually received.", variant: "destructive" }); return;
    }
    setBusy(true);
    try {
      const variance = calculateWithholdingTaxVariance(Number(row.provisional_withholding_tax || 0), actual);
      const { error } = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: Error | null }> }).rpc("record_claims_settlement_remittance", {
        p_settlement_period_id: row.id,
        p_advice_reference: form.paymentAdviceReference.trim(),
        p_advice_date: form.paymentAdviceDate,
        p_receipt_date: form.receiptDate || null,
        p_approved_gross_amount: approved,
        p_rejected_amount: rejection,
        p_actual_withholding_tax: actual,
        p_net_cash_received: payment,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["claims_settlement_periods"] });
      setAdviceId(""); setForm(emptyForm);
      toast({ title: "Payment advice recorded", description: `Remittance appended to the original claims period. WHT variance against the provisional estimate: ${Number(variance || 0).toFixed(2)}.` });
    } catch (error: any) { toast({ title: "Unable to record advice", description: error.message || "Please try again.", variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const reconcilePeriod = async (row: SettlementRow) => {
    if (!canWriteSettlements) { toast({ title: "Permission required", description: "You need settlement write permission to reconcile a settlement period.", variant: "destructive" }); return; }
    if (!user?.id) { toast({ title: "Authenticated user required", description: "Sign in again before confirming a settlement.", variant: "destructive" }); return; }
    if (!canReconcileSettlement({ settlementStatus: row.settlement_status, paymentReceived: row.payment_received, rejectionAmount: row.rejection_amount, actualWithholdingTax: row.actual_withholding_tax, paymentAdviceReference: row.payment_advice_reference, paymentAdviceDate: row.payment_advice_date })) { toast({ title: "Reconciliation not ready", description: "Payment advice must be completely recorded before the period can be reconciled.", variant: "destructive" }); return; }
    setBusy(true);
    try { await updatePeriod.mutateAsync({ id: row.id, settlement_status: "reconciled", confirmed_by: user.id, confirmed_at: new Date().toISOString() }); toast({ title: "Settlement reconciled", description: "The period is now marked as reconciled." }); }
    catch (error: any) { toast({ title: "Unable to reconcile settlement", description: error.message || "Please try again.", variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const selectedAdvicePeriod = (periods || []).find((row: SettlementRow) => row.id === adviceId);
  const expectedActualWht = useMemo(() => {
    if (!selectedAdvicePeriod || form.approvedGrossAmount.trim() === "") return null;
    const approved = Number(form.approvedGrossAmount);
    const approvedRate = Number(selectedAdvicePeriod.withholding_tax_rate);
    if (!Number.isFinite(approved) || approved < 0 || !Number.isFinite(approvedRate) || approvedRate < 0) return null;
    return Math.round((approved * approvedRate / 100 + Number.EPSILON) * 100) / 100;
  }, [selectedAdvicePeriod, form.approvedGrossAmount]);

  if (permissionsLoading) {
    return <div className="stat-card flex min-h-[240px] items-center justify-center text-muted-foreground">Checking settlement access…</div>;
  }

  if (!canReadSettlements) {
    return (
      <div className="stat-card flex min-h-[240px] flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-lg font-semibold">Claims settlement access restricted</h1>
        <p className="max-w-md text-sm text-muted-foreground">Your account does not have the payments.read permission. No settlement history or insurer data is requested until access is granted.</p>
      </div>
    );
  }

  return <div className="space-y-6">
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><h1 className="page-title">Claims Settlement Tracking</h1><p className="page-description">Record period-level totals from the external claims platform and reconcile confirmed payment advice. Monthly periods must cover a complete calendar month to feed the monthly claims summary; quarterly/custom periods remain in the settlement report. Detailed claims and advice documents remain outside CareFlow.</p></div><Badge variant="secondary">EXTERNAL SOURCE OF TRUTH</Badge></div>
    <SettlementManagementReport periods={periods || []} />
    {canWriteSettlements ? <section className="stat-card space-y-4"><div className="flex items-center gap-2"><PlusCircle className="h-5 w-5" /><h2 className="font-semibold">New settlement period</h2></div><div className="grid gap-4 md:grid-cols-3">
      <div><Label>Insurance company</Label><select className="mt-1 h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm" value={form.insurerId} onChange={(e) => update("insurerId", e.target.value)}><option value="">Select insurer…</option>{(insurers || []).map((row: any) => <option key={row.id} value={row.id}>{row.company_name}</option>)}</select></div>
      <div><Label>Period type</Label><select className="mt-1 h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-0 text-sm" value={form.periodType} onChange={(e) => update("periodType", e.target.value)}><option value="month">Month</option><option value="quarter">Quarter</option><option value="custom">Custom</option></select></div>
      <div><Label>Approved WHT rate (%)</Label><Input type="number" min="0" max="100" step="0.01" placeholder="Enter approved rate" value={form.withholdingTaxRate} onChange={(e) => update("withholdingTaxRate", e.target.value)} /></div>
      <div><Label>Period start</Label><Input type="date" value={form.periodStart} onChange={(e) => update("periodStart", e.target.value)} /></div><div><Label>Period end</Label><Input type="date" value={form.periodEnd} onChange={(e) => update("periodEnd", e.target.value)} /></div><div><Label>Total claims submitted</Label><Input type="number" min="0" step="0.01" value={form.totalClaimsSubmitted} onChange={(e) => update("totalClaimsSubmitted", e.target.value)} /></div>
    </div><div className="rounded-md border bg-muted/30 p-3 text-sm"><span className="font-medium">Provisional WHT estimate:</span> {form.withholdingTaxRate.trim() ? provisional.toFixed(2) : "Enter the approved rate to calculate"} <span className="text-muted-foreground">— estimate only; actual WHT is entered from payment advice.</span></div><Button className="w-full sm:w-auto" disabled={busy} onClick={() => void createPeriod()}>Record period</Button></section> : <section className="stat-card"><h2 className="font-semibold">Settlement history access</h2><p className="mt-1 text-sm text-muted-foreground">You have read access to settlement history, but settlement recording and reconciliation require payment write permission.</p></section>}
    {canWriteSettlements && <section className="stat-card space-y-4"><div><h2 className="font-semibold">Payment advice reconciliation</h2><p className="text-sm text-muted-foreground">CareFlow stores the advice reference and confirmed figures, not the advice document.</p></div><div><Label>Period</Label><select className="mt-1 h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm" value={adviceId} onChange={(e) => { setAdviceId(e.target.value); setForm(emptyForm); }}><option value="">Select a claims period…</option>{(periods || []).map((row: SettlementRow) => <option key={row.id} value={row.id}>{row.period_start} → {row.period_end} · {insurerNames.get(row.insurance_company_id) || row.insurance_company_id}</option>)}</select></div>{selectedAdvicePeriod && <div className="grid gap-4 md:grid-cols-2"><div><Label>Insurer-approved gross amount</Label><Input type="number" min="0" step="0.01" value={form.approvedGrossAmount} onChange={(e) => update("approvedGrossAmount", e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">Enter the approved gross figure exactly as stated on this advice; it is not calculated from submitted less rejected.</p></div><div><Label>Net cash received (after WHT)</Label><Input type="number" min="0" step="0.01" value={form.paymentReceived} onChange={(e) => update("paymentReceived", e.target.value)} /></div><div><Label>Rejection amount</Label><Input type="number" min="0" step="0.01" value={form.rejectionAmount} onChange={(e) => update("rejectionAmount", e.target.value)} /></div><div><Label>Actual withholding tax (from advice)</Label><Input type="number" min="0" step="0.01" value={form.actualWithholdingTax} onChange={(e) => update("actualWithholdingTax", e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">{expectedActualWht === null ? "Enter a valid rejection amount to calculate expected actual WHT." : `Expected at the facility-approved rate on the approved gross amount: ${expectedActualWht.toFixed(2)}. Record the amount stated on the insurer advice; investigate any difference.`}</p></div><div className="rounded-md border bg-muted/30 p-3 text-sm md:col-span-2"><div className="font-medium">Payment advice check</div><div className="mt-1 text-muted-foreground">Submitted less rejected comparison: {form.rejectionAmount.trim() === "" ? "—" : `GH¢ ${(Number(selectedAdvicePeriod.total_claims_submitted || 0) - Number(form.rejectionAmount)).toFixed(2)}`} · Insurer-approved gross entered: {form.approvedGrossAmount.trim() === "" ? "—" : `GH¢ ${Number(form.approvedGrossAmount).toFixed(2)}`} · Expected WHT on entered approved gross: {expectedActualWht === null ? "—" : `GH¢ ${expectedActualWht.toFixed(2)}`}</div><div className="mt-1 text-xs text-muted-foreground">Use the actual WHT and net cash figures stated in the insurer advice. Investigate any difference from the statutory-rate estimate before reconciliation.</div></div><div><Label>Payment advice reference</Label><Input value={form.paymentAdviceReference} onChange={(e) => update("paymentAdviceReference", e.target.value)} /></div><div><Label>Payment advice date</Label><Input type="date" value={form.paymentAdviceDate} onChange={(e) => update("paymentAdviceDate", e.target.value)} /></div><div><Label>Actual cash receipt date</Label><Input type="date" value={form.receiptDate} onChange={(e) => update("receiptDate", e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">Leave blank if no cash has been received yet.</p></div><div className="flex items-end"><Button className="w-full sm:w-auto" disabled={busy} onClick={() => void recordAdvice(selectedAdvicePeriod)}><CheckCircle2 className="mr-2 h-4 w-4" />Record payment advice</Button></div></div>}</section>}
    <section className="stat-card"><div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><h2 className="font-semibold">Settlement history</h2><p className="text-sm text-muted-foreground">Period-level operational history only.</p></div><div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap"><select aria-label="Filter by insurer" className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm sm:w-auto" value={insurerFilter} onChange={(e) => setInsurerFilter(e.target.value)}><option value="all">All insurers</option>{(insurers || []).map((row: any) => <option key={row.id} value={row.id}>{row.company_name}</option>)}</select><select aria-label="Filter by settlement status" className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm sm:w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="awaiting_payment">Awaiting payment</option><option value="payment_advice_received">Advice received</option><option value="reconciled">Reconciled</option></select></div></div>{isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : <div className="max-w-full overflow-x-auto rounded-md border"><table className="data-table w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Period</th><th className="p-2">Insurer</th><th className="p-2">Submitted</th><th className="p-2">Provisional WHT</th><th className="p-2">Payment</th><th className="p-2">Rejection</th><th className="p-2">Actual WHT</th><th className="p-2">WHT variance</th><th className="p-2">Status</th><th className="p-2">Action</th></tr></thead><tbody>{visiblePeriods.map((row: SettlementRow) => <tr key={row.id} className="border-b"><td className="p-2 whitespace-nowrap">{row.period_start} → {row.period_end}</td><td className="p-2 min-w-[10rem] break-words">{insurerNames.get(row.insurance_company_id) || row.insurance_company_id}</td><td className="p-2 whitespace-nowrap">{Number(row.total_claims_submitted || 0).toFixed(2)}</td><td className="p-2 whitespace-nowrap">{Number(row.provisional_withholding_tax || 0).toFixed(2)}</td><td className="p-2 whitespace-nowrap">{row.payment_received == null ? "—" : Number(row.payment_received).toFixed(2)}</td><td className="p-2 whitespace-nowrap">{row.rejection_amount == null ? "—" : Number(row.rejection_amount).toFixed(2)}</td><td className="p-2 whitespace-nowrap">{row.actual_withholding_tax == null ? "—" : Number(row.actual_withholding_tax).toFixed(2)}</td><td className={`p-2 whitespace-nowrap ${row.withholding_tax_variance == null ? "text-muted-foreground" : Number(row.withholding_tax_variance) === 0 ? "" : "font-medium"}`}>{row.withholding_tax_variance == null ? "—" : Number(row.withholding_tax_variance).toFixed(2)}</td><td className="p-2 whitespace-nowrap"><Badge variant="outline">{String(row.settlement_status).replace(/_/g, " ")}</Badge></td><td className="p-2 whitespace-nowrap">{row.settlement_status === "payment_advice_received" && canWriteSettlements ? <Button size="sm" variant="outline" className="min-h-9" disabled={busy} onClick={() => void reconcilePeriod(row)}>Reconcile</Button> : row.settlement_status === "reconciled" ? <span className="text-xs text-muted-foreground">Confirmed</span> : "—"}</td></tr>)}{!visiblePeriods.length && <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">No settlement periods match the selected filters.</td></tr>}</tbody></table></div>}</section>
    <section className="stat-card space-y-3">
      <div><h2 className="font-semibold">Payment advice and remittance history</h2><p className="text-sm text-muted-foreground">Each insurer advice is retained as a separate event against its original claims period. Corrections must not overwrite this history.</p></div>
      <div className="max-w-full overflow-x-auto rounded-md border"><table className="data-table w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Claims period</th><th className="p-2">Advice reference</th><th className="p-2">Advice date</th><th className="p-2">Receipt date</th><th className="p-2">Approved gross</th><th className="p-2">Rejected</th><th className="p-2">Actual WHT</th><th className="p-2">Net cash</th></tr></thead><tbody>{(remittances || []).map((entry: SettlementRow) => {
        const parent = (periods || []).find((period: SettlementRow) => period.id === entry.settlement_period_id);
        return <tr key={entry.id} className="border-b"><td className="p-2 whitespace-nowrap">{parent ? `${parent.period_start} → ${parent.period_end}` : "—"}</td><td className="p-2">{entry.advice_reference}</td><td className="p-2 whitespace-nowrap">{entry.advice_date}</td><td className="p-2 whitespace-nowrap">{entry.receipt_date || "Pending"}</td><td className="p-2 whitespace-nowrap">{entry.approved_gross_amount == null ? "Not captured (legacy)" : Number(entry.approved_gross_amount).toFixed(2)}</td><td className="p-2 whitespace-nowrap">{entry.rejected_amount == null ? "Not captured" : Number(entry.rejected_amount).toFixed(2)}</td><td className="p-2 whitespace-nowrap">{entry.actual_withholding_tax == null ? "Not captured" : Number(entry.actual_withholding_tax).toFixed(2)}</td><td className="p-2 whitespace-nowrap">{entry.net_cash_received == null ? "Not captured" : Number(entry.net_cash_received).toFixed(2)}</td></tr>;
      })}{!(remittances || []).length && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No payment advice entries have been recorded.</td></tr>}</tbody></table></div>
    </section>
    <SettlementExceptionRegister periods={periods || []} />
  </div>;
}