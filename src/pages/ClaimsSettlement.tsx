import { useMemo, useState } from "react";
import { CheckCircle2, PlusCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useSupabaseInsert, useSupabaseQuery, useSupabaseUpdate } from "@/hooks/useSupabaseQuery";
import { useAuth } from "@/contexts/AuthContext";
import { getStoredFacilityId } from "@/features/preauth/services/preauthFacility.service";
import { calculateProvisionalWithholdingTax, calculateWithholdingTaxVariance, canReconcileSettlement } from "@/features/settlements/domain/settlement";
import SettlementExceptionRegister from "@/components/settlements/SettlementExceptionRegister";

const emptyForm = { insurerId: "", periodStart: "", periodEnd: "", periodType: "month" as "month" | "quarter" | "custom", totalClaimsSubmitted: "", withholdingTaxRate: "5", paymentReceived: "", rejectionAmount: "", actualWithholdingTax: "", paymentAdviceReference: "", paymentAdviceDate: "" };
type SettlementRow = Record<string, any>;

export default function ClaimsSettlement() {
  const { user } = useAuth();
  const facilityId = getStoredFacilityId();
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: periods, isLoading } = useSupabaseQuery("claims_settlement_periods", { orderBy: "period_start" });
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
    if (!facilityId) { toast({ title: "Facility context required", description: "Select a facility before recording settlement information.", variant: "destructive" }); return; }
    if (!form.insurerId || !form.periodStart || !form.periodEnd || !form.totalClaimsSubmitted) { toast({ title: "Complete the period details", description: "Insurer, period dates and total claims submitted are required.", variant: "destructive" }); return; }
    if (new Date(form.periodEnd) < new Date(form.periodStart)) { toast({ title: "Invalid period", description: "The period end date cannot be before the start date.", variant: "destructive" }); return; }
    if (!Number.isFinite(submitted) || submitted < 0 || !Number.isFinite(rate) || rate < 0 || rate > 100) { toast({ title: "Invalid settlement values", description: "Claims submitted must be non-negative and WHT rate must be between 0 and 100%.", variant: "destructive" }); return; }
    setBusy(true);
    try {
      await insertPeriod.mutateAsync({ facility_id: facilityId, insurance_company_id: form.insurerId, period_start: form.periodStart, period_end: form.periodEnd, period_type: form.periodType, total_claims_submitted: submitted, withholding_tax_rate: rate, provisional_withholding_tax: provisional, settlement_status: "awaiting_payment" });
      setForm(emptyForm);
      toast({ title: "Settlement period recorded", description: `Provisional WHT: ${provisional.toFixed(2)}. This is an estimate only.` });
    } catch (error: any) { toast({ title: "Unable to save period", description: error.message || "Please try again.", variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const recordAdvice = async (row: SettlementRow) => {
    if (!form.paymentReceived || !form.rejectionAmount || !form.actualWithholdingTax || !form.paymentAdviceReference || !form.paymentAdviceDate) { toast({ title: "Complete payment advice details", description: "Payment received, rejection, actual WHT, advice reference and advice date are required.", variant: "destructive" }); return; }
    const payment = Number(form.paymentReceived); const rejection = Number(form.rejectionAmount); const actual = Number(form.actualWithholdingTax);
    if (![payment, rejection, actual].every((value) => Number.isFinite(value) && value >= 0)) { toast({ title: "Invalid payment advice figures", description: "Payment, rejection and actual WHT must be non-negative numbers.", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const variance = calculateWithholdingTaxVariance(Number(row.provisional_withholding_tax || 0), actual);
      await updatePeriod.mutateAsync({ id: row.id, payment_received: payment, rejection_amount: rejection, actual_withholding_tax: actual, withholding_tax_variance: variance, payment_advice_reference: form.paymentAdviceReference.trim(), payment_advice_date: form.paymentAdviceDate, settlement_status: "payment_advice_received" });
      setAdviceId(""); setForm(emptyForm);
      toast({ title: "Payment advice recorded", description: `WHT variance: ${Number(variance || 0).toFixed(2)}. Actual WHT was taken from the advice.` });
    } catch (error: any) { toast({ title: "Unable to record advice", description: error.message || "Please try again.", variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const reconcilePeriod = async (row: SettlementRow) => {
    if (!user?.id) { toast({ title: "Authenticated user required", description: "Sign in again before confirming a settlement.", variant: "destructive" }); return; }
    if (!canReconcileSettlement({ settlementStatus: row.settlement_status, paymentReceived: row.payment_received, rejectionAmount: row.rejection_amount, actualWithholdingTax: row.actual_withholding_tax, paymentAdviceReference: row.payment_advice_reference, paymentAdviceDate: row.payment_advice_date })) { toast({ title: "Reconciliation not ready", description: "Payment advice must be completely recorded before the period can be reconciled.", variant: "destructive" }); return; }
    setBusy(true);
    try { await updatePeriod.mutateAsync({ id: row.id, settlement_status: "reconciled", confirmed_by: user.id, confirmed_at: new Date().toISOString() }); toast({ title: "Settlement reconciled", description: "The period is now marked as reconciled." }); }
    catch (error: any) { toast({ title: "Unable to reconcile settlement", description: error.message || "Please try again.", variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const selectedAdvicePeriod = (periods || []).find((row: SettlementRow) => row.id === adviceId);
  return <div className="space-y-6">
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><h1 className="page-title">Claims Settlement Tracking</h1><p className="page-description">Record period-level totals from the external claims platform and reconcile confirmed payment advice. Detailed claims and advice documents remain outside CareFlow.</p></div><Badge variant="secondary">EXTERNAL SOURCE OF TRUTH</Badge></div>
    <section className="stat-card space-y-4"><div className="flex items-center gap-2"><PlusCircle className="h-5 w-5" /><h2 className="font-semibold">New settlement period</h2></div><div className="grid gap-4 md:grid-cols-3">
      <div><Label>Insurance company</Label><select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.insurerId} onChange={(e) => update("insurerId", e.target.value)}><option value="">Select insurer…</option>{(insurers || []).map((row: any) => <option key={row.id} value={row.id}>{row.company_name}</option>)}</select></div>
      <div><Label>Period type</Label><select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.periodType} onChange={(e) => update("periodType", e.target.value)}><option value="month">Month</option><option value="quarter">Quarter</option><option value="custom">Custom</option></select></div>
      <div><Label>WHT rate (%)</Label><Input type="number" min="0" max="100" step="0.01" value={form.withholdingTaxRate} onChange={(e) => update("withholdingTaxRate", e.target.value)} /></div>
      <div><Label>Period start</Label><Input type="date" value={form.periodStart} onChange={(e) => update("periodStart", e.target.value)} /></div><div><Label>Period end</Label><Input type="date" value={form.periodEnd} onChange={(e) => update("periodEnd", e.target.value)} /></div><div><Label>Total claims submitted</Label><Input type="number" min="0" step="0.01" value={form.totalClaimsSubmitted} onChange={(e) => update("totalClaimsSubmitted", e.target.value)} /></div>
    </div><div className="rounded-md border bg-muted/30 p-3 text-sm"><span className="font-medium">Provisional WHT estimate:</span> {provisional.toFixed(2)} <span className="text-muted-foreground">— estimate only; actual WHT is entered from payment advice.</span></div><Button disabled={busy} onClick={() => void createPeriod()}>Record period</Button></section>
    <section className="stat-card space-y-4"><div><h2 className="font-semibold">Payment advice reconciliation</h2><p className="text-sm text-muted-foreground">CareFlow stores the advice reference and confirmed figures, not the advice document.</p></div><div><Label>Period</Label><select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={adviceId} onChange={(e) => { setAdviceId(e.target.value); setForm(emptyForm); }}><option value="">Select an awaiting period…</option>{(periods || []).filter((row: SettlementRow) => row.settlement_status === "awaiting_payment").map((row: SettlementRow) => <option key={row.id} value={row.id}>{row.period_start} → {row.period_end} · {insurerNames.get(row.insurance_company_id) || row.insurance_company_id}</option>)}</select></div>{selectedAdvicePeriod && <div className="grid gap-4 md:grid-cols-2"><div><Label>Payment received</Label><Input type="number" min="0" step="0.01" value={form.paymentReceived} onChange={(e) => update("paymentReceived", e.target.value)} /></div><div><Label>Rejection amount</Label><Input type="number" min="0" step="0.01" value={form.rejectionAmount} onChange={(e) => update("rejectionAmount", e.target.value)} /></div><div><Label>Actual withholding tax</Label><Input type="number" min="0" step="0.01" value={form.actualWithholdingTax} onChange={(e) => update("actualWithholdingTax", e.target.value)} /></div><div><Label>Payment advice reference</Label><Input value={form.paymentAdviceReference} onChange={(e) => update("paymentAdviceReference", e.target.value)} /></div><div><Label>Payment advice date</Label><Input type="date" value={form.paymentAdviceDate} onChange={(e) => update("paymentAdviceDate", e.target.value)} /></div><div className="flex items-end"><Button disabled={busy} onClick={() => void recordAdvice(selectedAdvicePeriod)}><CheckCircle2 className="mr-2 h-4 w-4" />Record payment advice</Button></div></div>}</section>
    <section className="stat-card"><div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><h2 className="font-semibold">Settlement history</h2><p className="text-sm text-muted-foreground">Period-level operational history only.</p></div><div className="flex flex-wrap gap-2"><select aria-label="Filter by insurer" className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={insurerFilter} onChange={(e) => setInsurerFilter(e.target.value)}><option value="all">All insurers</option>{(insurers || []).map((row: any) => <option key={row.id} value={row.id}>{row.company_name}</option>)}</select><select aria-label="Filter by settlement status" className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="awaiting_payment">Awaiting payment</option><option value="payment_advice_received">Advice received</option><option value="reconciled">Reconciled</option></select></div></div>{isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Period</th><th className="p-2">Insurer</th><th className="p-2">Submitted</th><th className="p-2">Provisional WHT</th><th className="p-2">Payment</th><th className="p-2">Rejection</th><th className="p-2">Actual WHT</th><th className="p-2">WHT variance</th><th className="p-2">Status</th><th className="p-2">Action</th></tr></thead><tbody>{visiblePeriods.map((row: SettlementRow) => <tr key={row.id} className="border-b"><td className="p-2">{row.period_start} → {row.period_end}</td><td className="p-2">{insurerNames.get(row.insurance_company_id) || row.insurance_company_id}</td><td className="p-2">{Number(row.total_claims_submitted || 0).toFixed(2)}</td><td className="p-2">{Number(row.provisional_withholding_tax || 0).toFixed(2)}</td><td className="p-2">{row.payment_received == null ? "—" : Number(row.payment_received).toFixed(2)}</td><td className="p-2">{row.rejection_amount == null ? "—" : Number(row.rejection_amount).toFixed(2)}</td><td className="p-2">{row.actual_withholding_tax == null ? "—" : Number(row.actual_withholding_tax).toFixed(2)}</td><td className={`p-2 ${row.withholding_tax_variance == null ? "text-muted-foreground" : Number(row.withholding_tax_variance) === 0 ? "" : "font-medium"}`}>{row.withholding_tax_variance == null ? "—" : Number(row.withholding_tax_variance).toFixed(2)}</td><td className="p-2"><Badge variant="outline">{String(row.settlement_status).replaceAll("_", " ")}</Badge></td><td className="p-2">{row.settlement_status === "payment_advice_received" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void reconcilePeriod(row)}>Reconcile</Button> : row.settlement_status === "reconciled" ? <span className="text-xs text-muted-foreground">Confirmed</span> : "—"}</td></tr>)}{!visiblePeriods.length && <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">No settlement periods match the selected filters.</td></tr>}</tbody></table></div>}</section>
    <SettlementExceptionRegister periods={periods || []} />
  </div>;
}
