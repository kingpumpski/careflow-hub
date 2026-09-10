import { useState } from "react";
import { Search, Plus, AlertCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import EntityDialog from "@/components/shared/EntityDialog";
import FilterBar from "@/components/shared/FilterBar";
import SortableHeader, { useSort } from "@/components/shared/SortableHeader";
import BulkImportDialog from "@/components/shared/BulkImportDialog";
import { useSupabaseQuery, useSupabaseInsert } from "@/hooks/useSupabaseQuery";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { usePermissions } from "@/modules/security/usePermissions";

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function Payments() {
  const { can } = usePermissions();
  const canWritePayments = can("payments.write");
  const { data: payments, isLoading } = useSupabaseQuery("payments");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: claims } = useSupabaseQuery("claims");
  const { data: withholdingTax } = useSupabaseQuery("withholding_tax");
  const insertPayment = useSupabaseInsert("payments");
  const insertLedger = useSupabaseInsert("ledger_entries");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<any>({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [detailInsurer, setDetailInsurer] = useState<any>(null);
  const [form, setForm] = useState({ insurance_company_id: "", amount_paid: "", payment_method: "Bank Transfer", reference_number: "", payment_date: new Date().toISOString().split("T")[0], claim_month: "", claim_year: String(new Date().getFullYear()) });

  const aggregated = (insurers || []).map((ins: any) => {
    const insPayments = (payments || []).filter((p: any) => p.insurance_company_id === ins.id);
    const totalPaid = insPayments.reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0);
    const insClaims = (claims || []).filter((c: any) => c.insurance_company_id === ins.id && c.status !== "rejected");
    const totalSubmitted = insClaims.reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
    const totalRejected = (claims || []).filter((c: any) => c.insurance_company_id === ins.id && c.status === "rejected").reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
    const netClaim = totalSubmitted - totalRejected;
    const insTax = (withholdingTax || []).filter((t: any) => t.insurance_company_id === ins.id);
    const totalTax = insTax.reduce((s: number, t: any) => s + Number(t.tax_amount || 0), 0);
    const variance = netClaim - totalPaid - totalTax;
    const refMap: Record<string, number> = {};
    insPayments.forEach((p: any) => { if (p.reference_number) refMap[p.reference_number] = (refMap[p.reference_number] || 0) + 1; });
    const duplicateRefs = Object.entries(refMap).filter(([, n]) => n > 1).map(([r]) => r);
    return { ...ins, totalPaid, totalSubmitted, totalTax, netClaim, outstanding: netClaim - totalPaid - totalTax, paymentCount: insPayments.length, payments: insPayments, variance, duplicateRefs };
  }).filter((a: any) => a.paymentCount > 0 || search === "");

  let filtered = aggregated.filter((a: any) => a.company_name?.toLowerCase().includes(search.toLowerCase()));
  if (filters.company) filtered = filtered.filter((a: any) => a.id === filters.company);
  const { sorted, sort, handleSort } = useSort(filtered);
  const grandPaid = aggregated.reduce((s: number, a: any) => s + a.totalPaid, 0);
  const grandNet = aggregated.reduce((s: number, a: any) => s + a.netClaim, 0);
  const grandTax = aggregated.reduce((s: number, a: any) => s + a.totalTax, 0);
  const grandOutstanding = grandNet - grandPaid - grandTax;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWritePayments) { toast({ title: "Permission required", description: "You need payment write permission to record a payment.", variant: "destructive" }); return; }
    try {
      const amount = parseFloat(form.amount_paid) || 0;
      await insertPayment.mutateAsync({ insurance_company_id: form.insurance_company_id || null, amount_paid: amount, payment_method: form.payment_method, reference_number: form.reference_number || null, payment_date: form.payment_date, claim_month: parseInt(form.claim_month) || null, claim_year: parseInt(form.claim_year) || null });
      await insertLedger.mutateAsync({ account_debit: "Cash/Bank", account_credit: "Accounts Receivable", amount, reference: `Payment ${form.reference_number || "N/A"}`, description: `Payment received`, insurance_company_id: form.insurance_company_id || null, claim_month: parseInt(form.claim_month) || null, claim_year: parseInt(form.claim_year) || null, entry_type: "payment" });
      toast({ title: "Payment recorded" });
      setAddDialogOpen(false);
      setForm({ insurance_company_id: "", amount_paid: "", payment_method: "Bank Transfer", reference_number: "", payment_date: new Date().toISOString().split("T")[0], claim_month: "", claim_year: String(new Date().getFullYear()) });
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  };

  if (detailInsurer) {
    const ins = aggregated.find((a: any) => a.id === detailInsurer);
    if (!ins) { setDetailInsurer(null); return null; }
    return (
      <div className="space-y-6 min-w-0">
        <div className="page-header flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3 min-w-0"><Button variant="ghost" size="sm" onClick={() => setDetailInsurer(null)} className="min-h-10 shrink-0">← Back</Button><h1 className="page-title min-w-0 flex items-center gap-2 break-words"><span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: ins.color || "#3b82f6" }} />{ins.company_name} — Payments</h1></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 min-w-0">
          <div className="stat-card min-w-0 text-center"><p className="text-base sm:text-2xl font-bold font-heading text-success break-words">GH¢ {ins.totalPaid.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Total Paid</p></div>
          <div className="stat-card min-w-0 text-center"><p className="text-base sm:text-2xl font-bold font-heading break-words">GH¢ {ins.netClaim.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Net Claim</p></div>
          <div className="stat-card min-w-0 text-center"><p className="text-base sm:text-2xl font-bold font-heading text-warning break-words">GH¢ {ins.totalTax.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">WHT</p></div>
          <div className="stat-card min-w-0 text-center"><p className="text-base sm:text-2xl font-bold font-heading text-destructive break-words">GH¢ {ins.outstanding.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Outstanding</p></div>
        </div>
        <div className="stat-card min-w-0">
          <h3 className="font-heading font-semibold mb-4">Payment History</h3>
          {ins.duplicateRefs.length > 0 && <div className="mb-3 p-3 rounded-md bg-warning/10 text-warning text-sm flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><div className="min-w-0 break-words">Duplicate reference(s) detected: <span className="font-mono">{ins.duplicateRefs.join(", ")}</span></div></div>}
          <div className="table-scroll"><table className="data-table min-w-[720px]"><thead><tr><th>Date</th><th>Claim Period</th><th>Amount (GH¢)</th><th>Method</th><th>Reference</th><th>Flag</th></tr></thead><tbody>{ins.payments.sort((a: any, b: any) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()).map((p: any) => { const isDup = p.reference_number && ins.duplicateRefs.includes(p.reference_number); return <tr key={p.id} className="hover:bg-muted/50 transition-colors"><td className="font-medium whitespace-nowrap">{p.payment_date}</td><td className="text-sm whitespace-nowrap">{p.claim_month ? `${monthNames[p.claim_month]} ${p.claim_year}` : "—"}</td><td className="font-semibold text-success whitespace-nowrap">GH¢ {Number(p.amount_paid).toLocaleString()}</td><td><Badge variant="secondary">{p.payment_method || "—"}</Badge></td><td className="text-muted-foreground font-mono text-xs whitespace-nowrap">{p.reference_number || "—"}</td><td>{isDup ? <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">Duplicate</Badge> : <span className="text-muted-foreground text-xs">—</span>}</td></tr>; })}</tbody></table></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0">
      <div className="page-header flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0"><h1 className="page-title">Payment Tracking</h1><p className="page-description">Monitor payments received from insurance companies</p></div>
        {canWritePayments ? <div className="page-actions grid grid-cols-2 sm:flex sm:flex-wrap"><Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2 min-h-10"><Upload className="w-4 h-4" />Import</Button><Button onClick={() => setAddDialogOpen(true)} className="gap-2 min-h-10"><Plus className="w-4 h-4" />Record Payment</Button></div> : <Badge variant="secondary">READ ONLY</Badge>}
      </div>
      <FilterBar filters={filters} onChange={setFilters} showCompany />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 min-w-0">
        <div className="stat-card min-w-0 text-center"><p className="text-sm text-muted-foreground">Total Received</p><p className="text-base sm:text-2xl font-bold font-heading text-success mt-1 break-words">GH¢ {grandPaid.toLocaleString()}</p></div>
        <div className="stat-card min-w-0 text-center"><p className="text-sm text-muted-foreground">Net Claims</p><p className="text-base sm:text-2xl font-bold font-heading mt-1 break-words">GH¢ {grandNet.toLocaleString()}</p></div>
        <div className="stat-card min-w-0 text-center"><p className="text-sm text-muted-foreground">WHT</p><p className="text-base sm:text-2xl font-bold font-heading text-warning mt-1 break-words">GH¢ {grandTax.toLocaleString()}</p></div>
        <div className="stat-card min-w-0 text-center"><p className="text-sm text-muted-foreground">Outstanding</p><p className="text-base sm:text-2xl font-bold font-heading text-destructive mt-1 break-words">GH¢ {grandOutstanding.toLocaleString()}</p></div>
      </div>
      <div className="stat-card min-w-0">
        {isLoading ? <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div> : <div className="table-scroll"><table className="data-table min-w-[900px]"><thead><tr><SortableHeader label="Insurance Company" sortKey="company_name" currentSort={sort} onSort={handleSort} /><SortableHeader label="Payments" sortKey="paymentCount" currentSort={sort} onSort={handleSort} /><SortableHeader label="Total Paid" sortKey="totalPaid" currentSort={sort} onSort={handleSort} /><SortableHeader label="Net Claims" sortKey="netClaim" currentSort={sort} onSort={handleSort} /><SortableHeader label="WHT" sortKey="totalTax" currentSort={sort} onSort={handleSort} /><SortableHeader label="Outstanding" sortKey="outstanding" currentSort={sort} onSort={handleSort} /><th>Reconciliation</th></tr></thead><tbody>{sorted.map((a: any) => <tr key={a.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setDetailInsurer(a.id)}><td className="font-medium"><div className="flex items-center gap-2 min-w-0"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color || "#3b82f6" }} /><span className="text-primary hover:underline whitespace-nowrap">{a.company_name}</span></div></td><td>{a.paymentCount}</td><td className="text-success font-semibold whitespace-nowrap">{a.totalPaid.toLocaleString()}</td><td className="whitespace-nowrap">{a.netClaim.toLocaleString()}</td><td className="text-warning whitespace-nowrap">{a.totalTax.toLocaleString()}</td><td className="text-destructive font-medium whitespace-nowrap">{a.outstanding.toLocaleString()}</td><td className="text-xs">{a.duplicateRefs.length > 0 ? <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">Duplicate Refs</Badge> : a.variance > 0.01 && a.netClaim > 0 ? <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">Short Paid</Badge> : a.variance < -0.01 ? <Badge variant="outline" className="bg-info/10 text-info border-info/20">Overpaid</Badge> : a.netClaim > 0 ? <Badge variant="outline" className="bg-success/10 text-success border-success/20">Reconciled</Badge> : <span className="text-muted-foreground">—</span>}</td></tr>)}{sorted.length === 0 && <tr><td colSpan={7} className="text-center text-muted-foreground py-8">No payments recorded.</td></tr>}</tbody>{sorted.length > 0 && <tfoot><tr className="font-bold bg-muted/30"><td>Grand Total</td><td>{aggregated.reduce((s: number, a: any) => s + a.paymentCount, 0)}</td><td className="text-success">{grandPaid.toLocaleString()}</td><td>{grandNet.toLocaleString()}</td><td className="text-warning">{grandTax.toLocaleString()}</td><td className="text-destructive">{grandOutstanding.toLocaleString()}</td><td></td></tr></tfoot>}</table></div>}
      </div>
      {canWritePayments && <EntityDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} title="Record Payment"><form onSubmit={handleSubmit} className="space-y-4"><div><Label>Insurance Company *</Label><select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.insurance_company_id} onChange={(e) => setForm({ ...form, insurance_company_id: e.target.value })} required><option value="">Select insurer...</option>{(insurers || []).filter((i: any) => i.is_active !== false).map((i: any) => <option key={i.id} value={i.id}>{i.company_name}</option>)}</select></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><Label>Claim Month *</Label><select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.claim_month} onChange={(e) => setForm({ ...form, claim_month: e.target.value })} required><option value="">Select...</option>{monthNames.slice(1).map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select></div><div><Label>Year *</Label><Input type="number" value={form.claim_year} onChange={(e) => setForm({ ...form, claim_year: e.target.value })} required className="mt-1" /></div></div><div><Label>Amount Paid (GH¢) *</Label><Input value={form.amount_paid} onChange={(e) => setForm({ ...form, amount_paid: e.target.value })} type="number" step="0.01" required className="mt-1" /></div><div><Label>Payment Date *</Label><Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} required className="mt-1" /></div><div><Label>Payment Method</Label><select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}><option value="Bank Transfer">Bank Transfer</option><option value="Cheque">Cheque</option><option value="Mobile Money">Mobile Money</option><option value="Cash">Cash</option></select></div><div><Label>Reference / Cheque Number</Label><Input value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} placeholder="e.g. CHQ-00123" className="mt-1" /></div><Button type="submit" className="w-full" disabled={insertPayment.isPending}>{insertPayment.isPending ? "Recording..." : "Record Payment"}</Button></form></EntityDialog>}
      {canWritePayments && <BulkImportDialog open={importOpen} onOpenChange={setImportOpen} title="Import Payments" description="Imported payments also create the corresponding cash-to-receivables ledger entries. Withholding tax and outstanding balances remain system-computed." columns={[{ key: "insurance_company_id", label: "Insurance Company", required: true, type: "lookup", options: (insurers || []).map((i: any) => ({ label: i.company_name, value: i.id })) },{ key: "amount_paid", label: "Amount Paid (GH¢)", required: true, type: "number" },{ key: "payment_date", label: "Payment Date", required: true, type: "date" },{ key: "claim_month", label: "Claim Month", required: true, type: "integer", example: 1 },{ key: "claim_year", label: "Claim Year", required: true, type: "integer", example: new Date().getFullYear() },{ key: "payment_method", label: "Payment Method", example: "Bank Transfer" },{ key: "reference_number", label: "Reference / Cheque Number" }]} onImport={async (rows) => { if (!canWritePayments) throw new Error("Payment write permission is required for imports."); const paymentsToInsert = rows.map((row) => ({ insurance_company_id: row.insurance_company_id, amount_paid: Number(row.amount_paid), payment_date: row.payment_date, claim_month: Number(row.claim_month), claim_year: Number(row.claim_year), payment_method: row.payment_method || "Bank Transfer", reference_number: row.reference_number || null })); const { error } = await (supabase.rpc as any)("import_payments_with_ledger", { p_rows: paymentsToInsert }); if (error) throw error; }} />}
    </div>
  );
}
