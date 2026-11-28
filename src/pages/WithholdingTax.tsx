import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import FilterBar from "@/components/shared/FilterBar";
import SortableHeader, { useSort } from "@/components/shared/SortableHeader";
import { usePermissions } from "@/modules/security/usePermissions";
import { getStoredFacilityId } from "@/features/preauth/services/preauthFacility.service";
import { databaseCapabilities } from "@/config/databaseCapabilities";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
type WhtCertificateReceiptRow = {
  id: string;
  settlement_period_id: string;
  insurance_company_id: string;
  certificate_reference: string;
  certificate_date: string;
  received_date: string;
  tax_amount: number | string;
};
type TaxRecord = { id: string; insurance_company_id: string; month: number; year: number; claim_total: number; tax_rate: number; tax_amount: number; is_actual: boolean };
type Insurer = { id: string; company_name: string; color?: string; email?: string; phone?: string; address?: string; contact_person?: string };
type TaxFilters = { company?: string; month?: string; year?: string };
type Setting = { key: string; value?: string | null };
type SettlementAdviceRow = {
  id: string;
  insurance_company_id: string;
  period_start: string;
  period_end: string;
  total_claims_submitted: number | null;
  rejection_amount: number | null;
  payment_received: number | null;
  actual_withholding_tax: number | null;
  payment_advice_reference: string | null;
  settlement_status: string;
  period_type?: string;
  actual_withholding_tax?: number | null;
};

export default function WithholdingTax() {
  const { can, loading: permissionsLoading } = usePermissions();
  const queryClient = useQueryClient();
  const canReadWHT = can("payments.read") || can("claims.settlement.read") || can("ledger.read") || can("reports.read");
  const facilityId = getStoredFacilityId();
  const { data: configuredRate } = useQuery({
    queryKey: ["configured-facility-wht-rate", facilityId],
    enabled: Boolean(facilityId) && canReadWHT && !permissionsLoading,
    queryFn: async () => {
      const rateRpc = supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }> };
      const { data, error } = await rateRpc.rpc("get_configured_withholding_tax_rate", { p_facility_id: facilityId });
      if (error) {
        if (error.code === "PGRST202" || error.code === "42883") return null;
        throw error;
      }
      return data == null ? null : Number(data);
    },
    staleTime: 60_000,
    retry: 1,
  });
  const { data: taxRecords, isLoading } = useSupabaseQuery("withholding_tax", { enabled: canReadWHT && !permissionsLoading });
  const { data: insurers } = useSupabaseQuery("insurance_companies", { enabled: canReadWHT && !permissionsLoading });
  const { data: settings } = useSupabaseQuery("system_settings", { enabled: can("settings.manage") && !permissionsLoading });
  const { data: settlementPeriods } = useSupabaseQuery("claims_settlement_periods", { enabled: canReadWHT && !permissionsLoading });
  const { data: taxReceipts, error: taxReceiptsError } = useQuery({
    queryKey: ["withholding-tax-receipts"],
    enabled: receiptFeatureEnabled && canReadTaxReceipts && !permissionsLoading,
    queryFn: async () => {
      const receiptReader = supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            order: (column: string, options: { ascending: boolean }) => PromiseLike<{ data: WhtCertificateReceiptRow[] | null; error: { message: string; code?: string; details?: string; hint?: string } | null }>;
          };
        };
      };
      const { data, error } = await receiptReader.from("withholding_tax_receipts").select("*").order("received_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
    retry: 1,
  });
  const [filters, setFilters] = useState<TaxFilters>({});
  const [detailInsurer, setDetailInsurer] = useState<string | null>(null);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [savingReceipt, setSavingReceipt] = useState(false);
  const [receiptForm, setReceiptForm] = useState({ settlementPeriodId: "", certificateReference: "", certificateDate: "", receivedDate: "", taxAmount: "", notes: "" });
  const canWriteReceipts = can("payments.write") || can("ledger.write");
  const canReadTaxReceipts = can("payments.read") || can("ledger.read");
  const receiptFeatureEnabled = databaseCapabilities.withholdingTaxCertificateReceipts;
  const configuredRateValue = ((settings || []) as unknown as Setting[]).find((s) => s.key === "withholding_tax_rate")?.value;
  const parsedCurrentRate = configuredRateValue == null || String(configuredRateValue).trim() === "" ? null : Number(configuredRateValue);
  const fallbackCurrentRate = parsedCurrentRate !== null && Number.isFinite(parsedCurrentRate) && parsedCurrentRate >= 0 && parsedCurrentRate <= 100 ? parsedCurrentRate : null;
  const currentRate = configuredRate ?? fallbackCurrentRate;
  const currentRateLabel = currentRate === null ? (can("settings.manage") ? "Not configured" : "Not available to your role") : `${currentRate}%`;

  const taxRows = (taxRecords || []) as unknown as TaxRecord[];
  const insurerRows = (insurers || []) as unknown as Insurer[];
  const aggregated = insurerRows.map((ins) => {
    let records = taxRows.filter((t) => t.insurance_company_id === ins.id);
    if (filters.month) records = records.filter((t) => t.month === parseInt(filters.month, 10));
    if (filters.year) records = records.filter((t) => t.year === parseInt(filters.year, 10));
    const byPeriod = new Map<string, { provisional: number; actual: number; hasActual: boolean; provisionalClaimBase: number; actualClaimBase: number; hasProvisional: boolean }>();
    records.forEach((record) => {
      const key = `${record.year}|${record.month}`;
      const current = byPeriod.get(key) || { provisional: 0, actual: 0, hasActual: false, provisionalClaimBase: 0, actualClaimBase: 0, hasProvisional: false };
      if (record.is_actual) {
        current.actual += Number(record.tax_amount || 0);
        current.hasActual = true;
        current.actualClaimBase += Number(record.claim_total || 0);
      } else {
        current.provisional += Number(record.tax_amount || 0);
        current.provisionalClaimBase += Number(record.claim_total || 0);
        current.hasProvisional = true;
      }
      byPeriod.set(key, current);
    });
    const totalTax = [...byPeriod.values()].reduce((sum, period) => sum + (period.hasActual ? period.actual : period.provisional), 0);
    const totalClaims = [...byPeriod.values()].reduce((sum, period) => sum + (period.hasProvisional ? period.provisionalClaimBase : period.actualClaimBase), 0);
    const actualCount = [...byPeriod.values()].filter((period) => period.hasActual).length;
    return { ...ins, records, totalTax, totalClaims, actualCount };
  }).filter((a) => a.records.length > 0);

  let displayData = aggregated;
  if (filters.company) displayData = displayData.filter((a) => a.id === filters.company);
  const { sorted, sort, handleSort } = useSort(displayData, "totalTax");
  const grandTotalTax = displayData.reduce((s, a) => s + a.totalTax, 0);
  const grandTotalClaims = displayData.reduce((s, a) => s + a.totalClaims, 0);
  const confirmedAdviceRows = ((settlementPeriods || []) as unknown as SettlementAdviceRow[]).filter((row) =>
    ["payment_advice_received", "reconciled"].includes(row.settlement_status)
      && row.actual_withholding_tax != null
  );
  const confirmedAdviceWht = confirmedAdviceRows.reduce((sum, row) => sum + Number(row.actual_withholding_tax || 0), 0);
  const receiptEligiblePeriods = ((settlementPeriods || []) as unknown as SettlementAdviceRow[]).filter((row) =>
    row.period_type === "month"
      && ["payment_advice_received", "reconciled"].includes(row.settlement_status)
      && Number(row.actual_withholding_tax || 0) > 0
  );
  const selectedReceiptPeriod = receiptEligiblePeriods.find((row) => row.id === receiptForm.settlementPeriodId);
  const recordedForSelectedPeriod = (taxReceipts || []).filter((receipt) => receipt.settlement_period_id === receiptForm.settlementPeriodId)
    .reduce((sum: number, receipt) => sum + Number(receipt.tax_amount || 0), 0);
  const remainingCertificateAmount = selectedReceiptPeriod
    ? Math.max(0, Number(selectedReceiptPeriod.actual_withholding_tax || 0) - recordedForSelectedPeriod)
    : 0;

  const saveTaxReceipt = async () => {
    if (!canWriteReceipts) {
      toast({ title: "Permission required", description: "Payment write or ledger write permission is required to record a WHT certificate.", variant: "destructive" });
      return;
    }
    if (!receiptForm.settlementPeriodId || !receiptForm.certificateReference.trim() || !receiptForm.certificateDate || !receiptForm.receivedDate || !receiptForm.taxAmount.trim()) {
      toast({ title: "Complete certificate details", description: "Select a confirmed claims period and enter the certificate reference, certificate date, receipt date and amount.", variant: "destructive" });
      return;
    }
    const amount = Number(receiptForm.taxAmount);
    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100 || amount > remainingCertificateAmount + 0.0001) {
      toast({ title: "Invalid certificate amount", description: `Enter a positive amount not exceeding the remaining confirmed WHT of GH¢ ${remainingCertificateAmount.toLocaleString()}.`, variant: "destructive" });
      return;
    }
    setSavingReceipt(true);
    try {
      const receiptWriter = supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ error: { message: string; code?: string; details?: string; hint?: string } | null }> };
      const { error } = await receiptWriter.rpc("record_withholding_tax_receipt", {
        p_settlement_period_id: receiptForm.settlementPeriodId,
        p_certificate_reference: receiptForm.certificateReference.trim(),
        p_certificate_date: receiptForm.certificateDate,
        p_received_date: receiptForm.receivedDate,
        p_tax_amount: amount,
        p_notes: receiptForm.notes.trim() || null,
      });
      if (error) throw error;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["withholding-tax-receipts"] }),
        queryClient.invalidateQueries({ queryKey: ["ledger_entries"] }),
        queryClient.invalidateQueries({ queryKey: ["company-statement-ledger"] }),
        queryClient.invalidateQueries({ queryKey: ["claims_settlement_periods"] }),
      ]);
      setReceiptForm({ settlementPeriodId: "", certificateReference: "", certificateDate: "", receivedDate: "", taxAmount: "", notes: "" });
      setReceiptDialogOpen(false);
      toast({ title: "WHT certificate recorded", description: "The tax-credit asset and insurer receivable credit have been posted. No cash receipt was recorded." });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message
        : error && typeof error === "object" && "message" in error ? String(error.message)
        : "Please try again.";
      toast({ title: "Unable to record WHT certificate", description: message, variant: "destructive" });
    } finally {
      setSavingReceipt(false);
    }
  };

  if (permissionsLoading) return <div className="stat-card py-12 text-center text-muted-foreground">Checking withholding tax access…</div>;
  if (!canReadWHT) return <div className="stat-card py-12 text-center"><h1 className="font-semibold">Withholding tax access restricted</h1><p className="mt-1 text-sm text-muted-foreground">You do not have permission to view withholding tax records.</p></div>;



  if (detailInsurer) {
    const ins = aggregated.find((a) => a.id === detailInsurer);
    if (!ins) return null;
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3"><button onClick={() => setDetailInsurer(null)} className="text-sm text-primary hover:underline">← Back</button><h1 className="page-title flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: ins.color || "#3b82f6" }} />{ins.company_name} — WHT Details</h1></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><div className="stat-card text-center"><p className="text-2xl font-bold font-heading text-primary">{currentRateLabel}</p><p className="text-xs text-muted-foreground mt-1">Tax Rate</p></div><div className="stat-card text-center"><p className="text-2xl font-bold font-heading">GH¢ {ins.totalClaims.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Claims Base</p></div><div className="stat-card text-center"><p className="text-2xl font-bold font-heading text-warning">GH¢ {ins.totalTax.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">WHT Deducted</p></div></div>
        <div className="stat-card overflow-x-auto"><table className="data-table"><thead><tr><th>Month</th><th>Year</th><th>Claim Total (GH¢)</th><th>Rate</th><th>Tax Amount (GH¢)</th><th>Settlement</th><th>Source</th></tr></thead><tbody>
          {[...ins.records].sort((a, b) => b.year - a.year || b.month - a.month).map((t) => <tr key={t.id} className="hover:bg-muted/50 transition-colors"><td>{monthNames[t.month]}</td><td>{t.year}</td><td>{Number(t.claim_total).toLocaleString()}</td><td>{Number(t.tax_rate)}%</td><td className="font-semibold text-primary">GH¢ {Number(t.tax_amount).toLocaleString()}</td><td><Badge variant="outline" className={t.is_actual ? "bg-success/10 text-success border-success/20" : "bg-warning/10 text-warning border-warning/20"}>{t.is_actual ? <><CheckCircle2 className="w-3 h-3 mr-1" />Actual</> : <><Clock3 className="w-3 h-3 mr-1" />Provisional</>}</Badge></td><td>{t.is_actual ? <span className="text-xs text-muted-foreground">Confirmed record</span> : <span className="text-xs text-muted-foreground">Estimate only</span>}</td></tr>)}
        </tbody></table></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header"><h1 className="page-title">Withholding Tax</h1><p className="page-description">Claim-side WHT estimates remain provisional. Actual WHT is recorded from insurer payment advice in Claims Settlement; this register displays those confirmed advice values separately.</p></div>
      <FilterBar filters={filters} onChange={setFilters} showCompany />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4"><div className="stat-card text-center"><p className="text-sm text-muted-foreground">Current Tax Rate</p><p className="text-2xl font-bold font-heading text-primary mt-1">{currentRateLabel}</p></div><div className="stat-card text-center"><p className="text-sm text-muted-foreground">Total WHT</p><p className="text-2xl font-bold font-heading mt-1">GH¢ {grandTotalTax.toLocaleString()}</p></div><div className="stat-card text-center"><p className="text-sm text-muted-foreground">Claims Base</p><p className="text-2xl font-bold font-heading mt-1">GH¢ {grandTotalClaims.toLocaleString()}</p></div><div className="stat-card text-center"><p className="text-sm text-muted-foreground">Actual Records</p><p className="text-2xl font-bold font-heading text-success mt-1">{displayData.reduce((s, a) => s + a.actualCount, 0)}</p></div></div>
      <section className="stat-card space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><h2 className="font-semibold">Insurer-paid WHT tax certificates</h2><p className="text-xs text-muted-foreground">Record the GRA certificate shared by the insurer. The posting recognises a recoverable tax-credit asset and reduces the insurer receivable; it does not record cash.</p></div>
          {receiptFeatureEnabled && canReadTaxReceipts && canWriteReceipts && <Button onClick={() => setReceiptDialogOpen(true)} disabled={!receiptEligiblePeriods.length}>Record WHT certificate</Button>}
        </div>
        {!receiptFeatureEnabled ? <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">Certificate capture is implemented but is not enabled in this environment until its database migration has passed release checks.</p>
          : !canReadTaxReceipts ? <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">Payment read or ledger read permission is required to view WHT certificate history.</p>
          : taxReceiptsError ? <p role="alert" className="text-sm text-destructive">WHT certificate history is unavailable: {taxReceiptsError instanceof Error ? taxReceiptsError.message : "The certificate table could not be read."}</p>
          : <div className="table-scroll"><table className="data-table min-w-[850px]"><thead><tr><th>Claims period</th><th>Insurance company</th><th>Certificate reference</th><th>Certificate date</th><th>Date received</th><th className="text-right">Tax credit (GH¢)</th></tr></thead><tbody>
            {(taxReceipts || []).map((receipt) => {
              const period = receiptEligiblePeriods.find((row) => row.id === receipt.settlement_period_id);
              return <tr key={receipt.id}><td>{period ? `${period.period_start} – ${period.period_end}` : receipt.settlement_period_id}</td><td>{insurerRows.find((ins) => ins.id === receipt.insurance_company_id)?.company_name || receipt.insurance_company_id}</td><td className="font-mono text-xs">{receipt.certificate_reference}</td><td>{receipt.certificate_date}</td><td>{receipt.received_date}</td><td className="text-right font-semibold">{Number(receipt.tax_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 })}</td></tr>;
            })}
            {!(taxReceipts || []).length && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No insurer-paid WHT certificates have been recorded.</td></tr>}
          </tbody></table></div>}
        <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Record insurer-paid WHT certificate</DialogTitle><DialogDescription>Only confirmed actual WHT from a monthly settlement period can be receipted. Multiple certificates may be recorded until the confirmed amount is fully supported.</DialogDescription></DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2"><Label>Confirmed claims period</Label><select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={receiptForm.settlementPeriodId} onChange={(e) => setReceiptForm((current) => ({ ...current, settlementPeriodId: e.target.value, taxAmount: "" }))}><option value="">Select period…</option>{receiptEligiblePeriods.map((row) => <option key={row.id} value={row.id}>{row.period_start} – {row.period_end} · {insurerRows.find((ins) => ins.id === row.insurance_company_id)?.company_name || row.insurance_company_id} · WHT GH¢ {Number(row.actual_withholding_tax || 0).toLocaleString()}</option>)}</select></div>
              <div><Label>Certificate reference</Label><Input value={receiptForm.certificateReference} maxLength={160} onChange={(e) => setReceiptForm((current) => ({ ...current, certificateReference: e.target.value }))} /></div>
              <div><Label>Certificate date</Label><Input type="date" value={receiptForm.certificateDate} onChange={(e) => setReceiptForm((current) => ({ ...current, certificateDate: e.target.value }))} /></div>
              <div><Label>Date received from insurer</Label><Input type="date" value={receiptForm.receivedDate} onChange={(e) => setReceiptForm((current) => ({ ...current, receivedDate: e.target.value }))} /></div>
              <div><Label>WHT amount on certificate (GH¢)</Label><Input type="number" min="0.01" step="0.01" max={remainingCertificateAmount} value={receiptForm.taxAmount} onChange={(e) => setReceiptForm((current) => ({ ...current, taxAmount: e.target.value }))} /></div>
              <div className="md:col-span-2"><Label>Notes (optional)</Label><Input value={receiptForm.notes} maxLength={1000} onChange={(e) => setReceiptForm((current) => ({ ...current, notes: e.target.value }))} /></div>
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-sm"><div className="flex justify-between gap-2"><span className="text-muted-foreground">Confirmed WHT</span><strong>GH¢ {Number(selectedReceiptPeriod?.actual_withholding_tax || 0).toLocaleString()}</strong></div><div className="mt-1 flex justify-between gap-2"><span className="text-muted-foreground">Previously receipted</span><strong>GH¢ {recordedForSelectedPeriod.toLocaleString()}</strong></div><div className="mt-1 flex justify-between gap-2"><span className="font-medium">Remaining certificate amount</span><strong>GH¢ {remainingCertificateAmount.toLocaleString()}</strong></div></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setReceiptDialogOpen(false)}>Cancel</Button><Button type="button" disabled={savingReceipt || !receiptForm.settlementPeriodId} onClick={() => void saveTaxReceipt()}>Record certificate and post</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </section>

      <section className="stat-card space-y-3">
        <div><h2 className="font-semibold">Confirmed WHT from payment advice</h2><p className="text-xs text-muted-foreground">Actual values below come from insurer payment advice. Provisional estimates are not added to this total.</p></div>
        <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-sm text-muted-foreground">Confirmed actual WHT</span><span className="text-2xl font-bold text-success">GH¢ {confirmedAdviceWht.toLocaleString()}</span></div>
        <div className="overflow-x-auto"><table className="data-table min-w-[900px]"><thead><tr><th>Period</th><th>Insurer</th><th>Submitted</th><th>Rejected</th><th>Approved Gross</th><th>Net Cash</th><th>Actual WHT</th><th>Advice Reference</th><th>Status</th></tr></thead><tbody>
          {confirmedAdviceRows.map((row) => <tr key={row.id}><td>{row.period_start} → {row.period_end}</td><td>{insurerRows.find((ins) => ins.id === row.insurance_company_id)?.company_name || row.insurance_company_id}</td><td>{Number(row.total_claims_submitted || 0).toLocaleString()}</td><td>{Number(row.rejection_amount || 0).toLocaleString()}</td><td>{Math.max(0, Number(row.total_claims_submitted || 0) - Number(row.rejection_amount || 0)).toLocaleString()}</td><td>{row.payment_received == null ? "—" : Number(row.payment_received).toLocaleString()}</td><td className="font-semibold text-success">{Number(row.actual_withholding_tax || 0).toLocaleString()}</td><td className="font-mono text-xs">{row.payment_advice_reference || "—"}</td><td><Badge variant="outline">{String(row.settlement_status).replace(/_/g, " ")}</Badge></td></tr>)}
          {!confirmedAdviceRows.length && <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">No confirmed payment-advice WHT records.</td></tr>}
        </tbody></table></div>
      </section>
      <div className="stat-card overflow-x-auto">{isLoading ? <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : <table className="data-table"><thead><tr><SortableHeader label="Insurance Company" sortKey="company_name" currentSort={sort} onSort={handleSort} /><SortableHeader label="Records" sortKey="records.length" currentSort={sort} onSort={handleSort} /><SortableHeader label="Claims Base (GH¢)" sortKey="totalClaims" currentSort={sort} onSort={handleSort} /><SortableHeader label="WHT (GH¢)" sortKey="totalTax" currentSort={sort} onSort={handleSort} /><th>Actual</th></tr></thead><tbody>{sorted.map((a) => <tr key={a.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setDetailInsurer(a.id)}><td className="font-medium"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color || "#3b82f6" }} /><span className="text-primary hover:underline">{a.company_name}</span></div></td><td>{a.records.length}</td><td>{a.totalClaims.toLocaleString()}</td><td className="font-semibold text-warning">GH¢ {a.totalTax.toLocaleString()}</td><td><Badge variant="outline" className="bg-success/10 text-success border-success/20">{a.actualCount}/{a.records.length}</Badge></td></tr>)}{sorted.length === 0 && <tr><td colSpan={5} className="text-center text-muted-foreground py-8">No WHT records.</td></tr>}</tbody>{sorted.length > 0 && <tfoot><tr className="font-bold bg-muted/30"><td>Grand Total</td><td>{displayData.reduce((s, a) => s + a.records.length, 0)}</td><td>{grandTotalClaims.toLocaleString()}</td><td className="text-warning">GH¢ {grandTotalTax.toLocaleString()}</td><td>{displayData.reduce((s, a) => s + a.actualCount, 0)}</td></tr></tfoot>}</table>}</div>
    </div>
  );
}