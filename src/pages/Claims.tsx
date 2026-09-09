import { useState } from "react";
import { Download, Plus, AlertTriangle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSupabaseQuery, useSupabaseInsert, useSupabaseBulkInsert } from "@/hooks/useSupabaseQuery";
import { Label } from "@/components/ui/label";
import EntityDialog from "@/components/shared/EntityDialog";
import FilterBar from "@/components/shared/FilterBar";
import SortableHeader, { useSort } from "@/components/shared/SortableHeader";
import { toast } from "@/hooks/use-toast";
import { exportClaimsPDF, exportClaimsExcel } from "@/lib/exportUtils";
import BulkImportDialog from "@/components/shared/BulkImportDialog";
import DownloadTemplate from "@/components/shared/DownloadTemplate";
import type { ImportColumn } from "@/lib/importUtils";

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function Claims() {
  const { data: claims, isLoading: claimsLoading } = useSupabaseQuery("claims");
  const { data: insurers, isLoading: insurersLoading } = useSupabaseQuery("insurance_companies");
  const { data: payments } = useSupabaseQuery("payments");
  const { data: withholdingTax } = useSupabaseQuery("withholding_tax");
  const { data: outstandingRows } = useSupabaseQuery("claims_outstanding_periods");
  const { data: settings } = useSupabaseQuery("system_settings");
  const insertClaim = useSupabaseInsert("claims");
  const insertWHT = useSupabaseInsert("withholding_tax");
  const insertLedger = useSupabaseInsert("ledger_entries");
  const bulkInsertClaims = useSupabaseBulkInsert("claims");
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<any>({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [detailInsurer, setDetailInsurer] = useState<any>(null);
  const [form, setForm] = useState({ insurance_company_id: "", claim_amount: "", claim_month: "", claim_year: String(new Date().getFullYear()) });
  const [rejectForm, setRejectForm] = useState({ insurance_company_id: "", rejected_amount: "", claim_month: "", claim_year: String(new Date().getFullYear()) });
  const [denialMeta, setDenialMeta] = useState({ denial_category: "", denial_reason: "", root_cause: "", denial_notes: "" });

  const isLoading = claimsLoading || insurersLoading;
  const taxRate = Number(settings?.find?.((s: any) => s.key === "withholding_tax_rate")?.value || "5");

  const claimImportColumns: ImportColumn[] = [
    { key: "insurance_company_id", label: "Insurance Company", required: true, type: "lookup", options: (insurers || []).map((i: any) => ({ label: i.company_name, value: i.id })), hint: "Must match a registered insurance company name" },
    { key: "claim_amount", label: "Claim Amount", required: true, type: "number" },
    { key: "claim_month", label: "Claim Month", required: true, type: "integer", example: 1, hint: "1-12 or month name" },
    { key: "claim_year", label: "Claim Year", required: true, type: "integer", example: new Date().getFullYear() },
    { key: "submission_date", label: "Submission Date", type: "date", hint: "Defaults to the first day of the claim month" },
    { key: "status", label: "Status", type: "text", example: "submitted", hint: "submitted, approved, paid, rejected, partial" },
  ];

  // Financial values come from the database's authoritative settlement view.
  // This prevents the Claims page from maintaining a second, divergent formula.
  const authoritativeRows = (outstandingRows || []).filter((row: any) =>
    (!filters.company || row.insurance_company_id === filters.company) &&
    (!filters.year || Number(row.period_year) === Number(filters.year)) &&
    (!filters.month || Number(row.period_month) === Number(filters.month))
  );

  const aggregated = (insurers || []).map((ins: any) => {
    const insClaims = (claims || []).filter((c: any) => c.insurance_company_id === ins.id);
    const rows = authoritativeRows.filter((r: any) => r.insurance_company_id === ins.id);
    const totalSubmitted = rows.reduce((s: number, r: any) => s + Number(r.submitted_amount || 0), 0);
    const totalRejected = rows.reduce((s: number, r: any) => s + Number(r.rejected_amount || 0), 0);
    const netClaim = rows.reduce((s: number, r: any) => s + Number(r.net_claim_amount || 0), 0);
    const totalPaid = rows.reduce((s: number, r: any) => s + Number(r.paid_amount || 0), 0);
    const totalTax = rows.reduce((s: number, r: any) => s + Number(r.withholding_tax_amount || 0), 0);
    const outstanding = rows.reduce((s: number, r: any) => s + Number(r.outstanding_amount || 0), 0);
    let paymentStatus = "Good";
    let paymentStatusColor = "bg-success/10 text-success border-success/20";
    if (outstanding > netClaim * 0.5) { paymentStatus = "Defaulting"; paymentStatusColor = "bg-destructive/10 text-destructive border-destructive/20"; }
    else if (outstanding > netClaim * 0.2) { paymentStatus = "Slow"; paymentStatusColor = "bg-warning/10 text-warning border-warning/20"; }
    return { ...ins, totalSubmitted, totalPaid, totalTax, totalRejected, netClaim, outstanding, claimCount: insClaims.length, paymentStatus, paymentStatusColor, claims: insClaims, payments: (payments || []).filter((p: any) => p.insurance_company_id === ins.id), taxRecords: (withholdingTax || []).filter((t: any) => t.insurance_company_id === ins.id), settlementRows: rows };
  }).filter((a: any) => a.claimCount > 0 || search === "");

  let filteredAggregated = aggregated.filter((a: any) => a.company_name?.toLowerCase().includes(search.toLowerCase()));
  if (filters.company) filteredAggregated = filteredAggregated.filter((a: any) => a.id === filters.company);
  const { sorted: sortedAggregated, sort, handleSort } = useSort(filteredAggregated);

  const grandTotalSubmitted = authoritativeRows.reduce((s: number, r: any) => s + Number(r.submitted_amount || 0), 0);
  const grandTotalPaid = authoritativeRows.reduce((s: number, r: any) => s + Number(r.paid_amount || 0), 0);
  const grandTotalTax = authoritativeRows.reduce((s: number, r: any) => s + Number(r.withholding_tax_amount || 0), 0);
  const grandRejected = authoritativeRows.reduce((s: number, r: any) => s + Number(r.rejected_amount || 0), 0);
  const grandNetClaim = authoritativeRows.reduce((s: number, r: any) => s + Number(r.net_claim_amount || 0), 0);
  const grandOutstanding = authoritativeRows.reduce((s: number, r: any) => s + Number(r.outstanding_amount || 0), 0);

  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const claimAmount = parseFloat(form.claim_amount) || 0;
      const month = parseInt(form.claim_month); const year = parseInt(form.claim_year);
      await insertClaim.mutateAsync({ insurance_company_id: form.insurance_company_id, claim_amount: claimAmount, claim_month: month, claim_year: year, status: "submitted" });
      const whtAmount = claimAmount * (taxRate / 100);
      await insertWHT.mutateAsync({ insurance_company_id: form.insurance_company_id, month, year, claim_total: claimAmount, tax_rate: taxRate, tax_amount: whtAmount, is_actual: false });
      await insertLedger.mutateAsync({ account_debit: "Accounts Receivable", account_credit: "Claims Revenue", amount: claimAmount, reference: `Claim ${monthNames[month]} ${year}`, description: "Monthly claim submission", insurance_company_id: form.insurance_company_id, claim_month: month, claim_year: year, entry_type: "claim_submission" });
      await insertLedger.mutateAsync({ account_debit: "WHT Expense", account_credit: "WHT Payable", amount: whtAmount, reference: `WHT ${monthNames[month]} ${year}`, description: "Withholding tax on claim", insurance_company_id: form.insurance_company_id, claim_month: month, claim_year: year, entry_type: "withholding_tax" });
      toast({ title: "Claim submitted", description: `WHT of GH¢ ${whtAmount.toLocaleString()} auto-calculated at ${taxRate}%` });
      setAddDialogOpen(false); setForm({ insurance_company_id: "", claim_amount: "", claim_month: "", claim_year: String(new Date().getFullYear()) });
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  };

  const handleSubmitRejection = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const rejectedAmount = parseFloat(rejectForm.rejected_amount) || 0;
      const month = parseInt(rejectForm.claim_month); const year = parseInt(rejectForm.claim_year);
      await insertClaim.mutateAsync({ insurance_company_id: rejectForm.insurance_company_id, claim_amount: rejectedAmount, claim_month: month, claim_year: year, status: "rejected", denial_category: denialMeta.denial_category || null, denial_reason: denialMeta.denial_reason || null, root_cause: denialMeta.root_cause || null, denial_notes: denialMeta.denial_notes || null, appeal_status: "not_filed" });
      const whtReduction = rejectedAmount * (taxRate / 100);
      await insertWHT.mutateAsync({ insurance_company_id: rejectForm.insurance_company_id, month, year, claim_total: -rejectedAmount, tax_rate: taxRate, tax_amount: -whtReduction, is_actual: false });
      await insertLedger.mutateAsync({ account_debit: "Revenue Adjustment", account_credit: "Accounts Receivable", amount: rejectedAmount, reference: `Rejection ${monthNames[month]} ${year}`, description: "Claim rejection", insurance_company_id: rejectForm.insurance_company_id, claim_month: month, claim_year: year, entry_type: "rejection" });
      toast({ title: "Rejection recorded", description: `Submitted & WHT adjusted by GH¢ -${whtReduction.toLocaleString()}` });
      setRejectDialogOpen(false); setRejectForm({ insurance_company_id: "", rejected_amount: "", claim_month: "", claim_year: String(new Date().getFullYear()) }); setDenialMeta({ denial_category: "", denial_reason: "", root_cause: "", denial_notes: "" });
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  };

  if (detailInsurer) {
    const ins = aggregated.find((a: any) => a.id === detailInsurer);
    if (!ins) { setDetailInsurer(null); return null; }
    const monthlyRows = [...ins.settlementRows].sort((a: any, b: any) => Number(b.period_year) - Number(a.period_year) || Number(b.period_month) - Number(a.period_month));
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3"><Button variant="ghost" size="sm" onClick={() => setDetailInsurer(null)}>← Back</Button><div><h1 className="page-title flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: ins.color || "#3b82f6" }} />{ins.company_name}</h1><p className="page-description">Claims profile & account details</p></div></div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="stat-card text-center"><p className="text-xl font-bold font-heading">GH¢ {ins.totalSubmitted.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Submitted</p></div>
          <div className="stat-card text-center"><p className="text-xl font-bold font-heading text-destructive">GH¢ {ins.totalRejected.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Rejected</p></div>
          <div className="stat-card text-center"><p className="text-xl font-bold font-heading">GH¢ {ins.netClaim.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Net Claim</p></div>
          <div className="stat-card text-center"><p className="text-xl font-bold font-heading text-success">GH¢ {ins.totalPaid.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Paid</p></div>
          <div className="stat-card text-center"><p className="text-xl font-bold font-heading text-warning">GH¢ {ins.totalTax.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">WHT</p></div>
          <div className="stat-card text-center"><p className="text-xl font-bold font-heading text-destructive">GH¢ {ins.outstanding.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Outstanding</p></div>
        </div>
        <div className="stat-card"><h3 className="font-heading font-semibold mb-4">Monthly Claims Breakdown</h3><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Period</th><th>Submitted</th><th>Rejected</th><th>Net Claim</th><th>WHT</th><th>Paid</th><th>Outstanding</th><th>Status</th></tr></thead><tbody>
          {monthlyRows.map((m: any) => <tr key={`${m.period_year}-${m.period_month}`} className="hover:bg-muted/50 transition-colors"><td className="font-medium">{monthNames[Number(m.period_month)] || "—"} {m.period_year}</td><td>GH¢ {Number(m.submitted_amount || 0).toLocaleString()}</td><td className="text-destructive">GH¢ {Number(m.rejected_amount || 0).toLocaleString()}</td><td className="font-medium">GH¢ {Number(m.net_claim_amount || 0).toLocaleString()}</td><td className="text-warning">GH¢ {Number(m.withholding_tax_amount || 0).toLocaleString()}</td><td className="text-success">GH¢ {Number(m.paid_amount || 0).toLocaleString()}</td><td className="font-semibold text-destructive">GH¢ {Number(m.outstanding_amount || 0).toLocaleString()}</td><td><Badge variant="outline" className={m.outstanding_status === "actual" ? "bg-success/10 text-success border-success/20" : "bg-warning/10 text-warning border-warning/20"}>{m.outstanding_status === "actual" ? "Actual" : "Provisional"}</Badge></td></tr>)}
          {monthlyRows.length === 0 && <tr><td colSpan={8} className="text-center text-muted-foreground py-6">No settlement data for this selection.</td></tr>}
        </tbody></table></div></div>
        <div className="stat-card"><h3 className="font-heading font-semibold mb-2">Contact Information</h3><div className="grid grid-cols-2 gap-4 text-sm"><div><span className="text-muted-foreground">Email:</span> {ins.email || "—"}</div><div><span className="text-muted-foreground">Phone:</span> {ins.phone || "—"}</div><div><span className="text-muted-foreground">Address:</span> {ins.address || "—"}</div><div><span className="text-muted-foreground">Contact:</span> {ins.contact_person || "—"}</div></div></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between"><div><h1 className="page-title">Claims Management</h1><p className="page-description">Outstanding = Submitted − Rejected − Paid − WHT. Settlement status is Actual only after payment and actual WHT are recorded.</p></div><div className="flex flex-wrap gap-2 items-center"><DownloadTemplate columns={claimImportColumns} fileName="claims-import-template" /><Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2"><Upload className="w-4 h-4" />Import History</Button><Button variant="destructive" onClick={() => setRejectDialogOpen(true)} className="gap-2"><AlertTriangle className="w-4 h-4" />Submit Rejection</Button><Button onClick={() => setAddDialogOpen(true)} className="gap-2"><Plus className="w-4 h-4" />Submit Claim</Button><Button variant="outline" className="gap-2" onClick={() => exportClaimsPDF(filteredAggregated, { grandTotalSubmitted, grandTotalPaid, grandTotalTax, grandOutstanding, grandRejected })}><Download className="w-4 h-4" />PDF</Button><Button variant="outline" className="gap-2" onClick={() => exportClaimsExcel(filteredAggregated, { grandTotalSubmitted, grandTotalPaid, grandTotalTax, grandOutstanding, grandRejected })}><Download className="w-4 h-4" />Excel</Button></div></div>
      <FilterBar filters={filters} onChange={setFilters} showCompany />
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3"><div className="stat-card text-center"><p className="text-xl font-bold font-heading">GH¢ {grandTotalSubmitted.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Submitted</p></div><div className="stat-card text-center"><p className="text-xl font-bold font-heading text-destructive">GH¢ {grandRejected.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Rejected</p></div><div className="stat-card text-center"><p className="text-xl font-bold font-heading">GH¢ {grandNetClaim.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Net Claim</p></div><div className="stat-card text-center"><p className="text-xl font-bold font-heading text-success">GH¢ {grandTotalPaid.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Paid</p></div><div className="stat-card text-center"><p className="text-xl font-bold font-heading text-warning">GH¢ {grandTotalTax.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">WHT</p></div><div className="stat-card text-center"><p className="text-xl font-bold font-heading text-destructive">GH¢ {grandOutstanding.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Outstanding</p></div></div>
      <div className="stat-card">{isLoading ? <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div> : <div className="overflow-x-auto"><table className="data-table"><thead><tr><SortableHeader label="Insurance Company" sortKey="company_name" currentSort={sort} onSort={handleSort} /><SortableHeader label="Claims" sortKey="claimCount" currentSort={sort} onSort={handleSort} /><SortableHeader label="Submitted" sortKey="totalSubmitted" currentSort={sort} onSort={handleSort} /><SortableHeader label="Rejected" sortKey="totalRejected" currentSort={sort} onSort={handleSort} /><SortableHeader label="Net Claim" sortKey="netClaim" currentSort={sort} onSort={handleSort} /><SortableHeader label="Paid" sortKey="totalPaid" currentSort={sort} onSort={handleSort} /><SortableHeader label="WHT" sortKey="totalTax" currentSort={sort} onSort={handleSort} /><SortableHeader label="Outstanding" sortKey="outstanding" currentSort={sort} onSort={handleSort} /><th>Status</th></tr></thead><tbody>{sortedAggregated.map((a: any) => <tr key={a.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setDetailInsurer(a.id)}><td className="font-medium"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color || "#3b82f6" }} /><span className="text-primary hover:underline">{a.company_name}</span></div></td><td className="font-semibold">{a.claimCount}</td><td>{a.totalSubmitted.toLocaleString()}</td><td className="text-destructive">{a.totalRejected.toLocaleString()}</td><td className="font-medium">{a.netClaim.toLocaleString()}</td><td className="text-success font-medium">{a.totalPaid.toLocaleString()}</td><td className="text-warning font-medium">{a.totalTax.toLocaleString()}</td><td className="text-destructive font-medium">{a.outstanding.toLocaleString()}</td><td><Badge variant="outline" className={a.paymentStatusColor}>{a.paymentStatus}</Badge></td></tr>)}{sortedAggregated.length === 0 && <tr><td colSpan={9} className="text-center text-muted-foreground py-8">No claims data.</td></tr>}</tbody>{sortedAggregated.length > 0 && <tfoot><tr className="font-bold bg-muted/30"><td>Grand Total</td><td>{aggregated.reduce((s: number, a: any) => s + a.claimCount, 0)}</td><td>{grandTotalSubmitted.toLocaleString()}</td><td className="text-destructive">{grandRejected.toLocaleString()}</td><td>{grandNetClaim.toLocaleString()}</td><td className="text-success">{grandTotalPaid.toLocaleString()}</td><td className="text-warning">{grandTotalTax.toLocaleString()}</td><td className="text-destructive">{grandOutstanding.toLocaleString()}</td><td></td></tr></tfoot>}</table></div>}</div>
      <EntityDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} title="Submit Monthly Claim"><form onSubmit={handleSubmitClaim} className="space-y-4"><div><Label>Insurance Company *</Label><select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.insurance_company_id} onChange={(e) => setForm({ ...form, insurance_company_id: e.target.value })} required><option value="">Select insurer...</option>{(insurers || []).filter((i: any) => i.is_active !== false).map((i: any) => <option key={i.id} value={i.id}>{i.company_name}</option>)}</select></div><div className="grid grid-cols-2 gap-3"><div><Label>Month *</Label><select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.claim_month} onChange={(e) => setForm({ ...form, claim_month: e.target.value })} required><option value="">Select...</option>{monthNames.slice(1).map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select></div><div><Label>Year *</Label><Input type="number" value={form.claim_year} onChange={(e) => setForm({ ...form, claim_year: e.target.value })} required className="mt-1" /></div></div><div><Label>Claim Amount (GH¢) *</Label><Input type="number" step="0.01" value={form.claim_amount} onChange={(e) => setForm({ ...form, claim_amount: e.target.value })} required className="mt-1" /></div>{form.claim_amount && <div className="p-3 bg-muted rounded-lg text-sm space-y-1"><p>WHT ({taxRate}%): <strong>GH¢ {(parseFloat(form.claim_amount) * taxRate / 100).toLocaleString()}</strong></p><p>Provisional Outstanding: <strong>GH¢ {(parseFloat(form.claim_amount) - parseFloat(form.claim_amount) * taxRate / 100).toLocaleString()}</strong></p></div>}<Button type="submit" className="w-full" disabled={insertClaim.isPending}>{insertClaim.isPending ? "Submitting..." : "Submit Claim"}</Button></form></EntityDialog>
      <EntityDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen} title="Submit Rejection"><form onSubmit={handleSubmitRejection} className="space-y-4"><div><Label>Insurance Company *</Label><select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={rejectForm.insurance_company_id} onChange={(e) => setRejectForm({ ...rejectForm, insurance_company_id: e.target.value })} required><option value="">Select insurer...</option>{(insurers || []).filter((i: any) => i.is_active !== false).map((i: any) => <option key={i.id} value={i.id}>{i.company_name}</option>)}</select></div><div className="grid grid-cols-2 gap-3"><div><Label>Month *</Label><select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={rejectForm.claim_month} onChange={(e) => setRejectForm({ ...rejectForm, claim_month: e.target.value })} required><option value="">Select...</option>{monthNames.slice(1).map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select></div><div><Label>Year *</Label><Input type="number" value={rejectForm.claim_year} onChange={(e) => setRejectForm({ ...rejectForm, claim_year: e.target.value })} required className="mt-1" /></div></div><div><Label>Rejected Amount (GH¢) *</Label><Input type="number" step="0.01" value={rejectForm.rejected_amount} onChange={(e) => setRejectForm({ ...rejectForm, rejected_amount: e.target.value })} required className="mt-1" /></div><div className="grid grid-cols-2 gap-3"><div><Label>Denial Category</Label><select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={denialMeta.denial_category} onChange={(e) => setDenialMeta({ ...denialMeta, denial_category: e.target.value })}><option value="">Select...</option><option value="coding_error">Coding Error</option><option value="missing_authorization">Missing Authorization</option><option value="missing_documentation">Missing Documentation</option><option value="not_covered">Service Not Covered</option><option value="duplicate_claim">Duplicate Claim</option><option value="tariff_dispute">Tariff Dispute</option><option value="eligibility">Eligibility Issue</option><option value="late_submission">Late Submission</option><option value="other">Other</option></select></div><div><Label>Root Cause</Label><select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={denialMeta.root_cause} onChange={(e) => setDenialMeta({ ...denialMeta, root_cause: e.target.value })}><option value="">Select...</option><option value="front_office">Front Office</option><option value="clinical">Clinical Documentation</option><option value="coding">Coding Team</option><option value="claims_officer">Claims Officer</option><option value="insurer">Insurer</option><option value="system">System / Process</option></select></div></div><div><Label>Denial Reason / Notes</Label><Input value={denialMeta.denial_reason} onChange={(e) => setDenialMeta({ ...denialMeta, denial_reason: e.target.value })} placeholder="Short reason from insurer" className="mt-1" /></div><Button type="submit" variant="destructive" className="w-full" disabled={insertClaim.isPending}>{insertClaim.isPending ? "Recording..." : "Record Rejection"}</Button></form></EntityDialog>
      <BulkImportDialog open={importOpen} onOpenChange={setImportOpen} title="Import Historical Claims" templateName="claims-import-template" description="Upload monthly claim totals per insurance company. Aggregate figures only — no patient-level data." columns={claimImportColumns} onImport={async (rows) => { await bulkInsertClaims.mutateAsync(rows.map((r) => ({ ...r, status: (r.status || "submitted").toString().toLowerCase().replace(/\s+/g, "_"), submission_date: r.submission_date || `${r.claim_year}-${String(r.claim_month).padStart(2, "0")}-01` }))); }} />
    </div>
  );
}
