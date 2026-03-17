import { useState } from "react";
import { Search, Download, Plus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSupabaseQuery, useSupabaseInsert } from "@/hooks/useSupabaseQuery";
import { Label } from "@/components/ui/label";
import EntityDialog from "@/components/shared/EntityDialog";
import { toast } from "@/hooks/use-toast";
import { exportClaimsPDF, exportClaimsExcel } from "@/lib/exportUtils";

const statusStyles: Record<string, string> = {
  submitted: "bg-info/10 text-info border-info/20",
  paid: "bg-success/10 text-success border-success/20",
  partial: "bg-warning/10 text-warning border-warning/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function Claims() {
  const { data: claims, isLoading: claimsLoading } = useSupabaseQuery("claims");
  const { data: insurers, isLoading: insurersLoading } = useSupabaseQuery("insurance_companies");
  const { data: payments } = useSupabaseQuery("payments");
  const { data: withholdingTax } = useSupabaseQuery("withholding_tax");
  const { data: settings } = useSupabaseQuery("system_settings");
  const insertClaim = useSupabaseInsert("claims");
  const insertWHT = useSupabaseInsert("withholding_tax");
  const [search, setSearch] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [detailInsurer, setDetailInsurer] = useState<any>(null);
  const [form, setForm] = useState({ insurance_company_id: "", claim_amount: "", claim_month: "", claim_year: String(new Date().getFullYear()) });
  const [rejectForm, setRejectForm] = useState({ insurance_company_id: "", rejected_amount: "", claim_month: "", claim_year: String(new Date().getFullYear()) });

  const isLoading = claimsLoading || insurersLoading;
  const taxRate = Number(settings?.find?.((s: any) => s.key === "withholding_tax_rate")?.value || "5");

  // Aggregate claims by insurance company
  const aggregated = (insurers || []).map((ins: any) => {
    const insClaims = (claims || []).filter((c: any) => c.insurance_company_id === ins.id);
    const totalSubmitted = insClaims.filter((c: any) => c.status !== "rejected").reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
    const totalRejected = insClaims.filter((c: any) => c.status === "rejected").reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
    const insPayments = (payments || []).filter((p: any) => p.insurance_company_id === ins.id);
    const totalPaid = insPayments.reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0);
    const insTax = (withholdingTax || []).filter((t: any) => t.insurance_company_id === ins.id);
    const totalTax = insTax.reduce((s: number, t: any) => s + Number(t.tax_amount || 0), 0);
    const outstanding = totalSubmitted - totalPaid - totalTax;

    let paymentStatus = "Good";
    let paymentStatusColor = "bg-success/10 text-success border-success/20";
    if (outstanding > totalSubmitted * 0.5) {
      paymentStatus = "Defaulting";
      paymentStatusColor = "bg-destructive/10 text-destructive border-destructive/20";
    } else if (outstanding > totalSubmitted * 0.2) {
      paymentStatus = "Slow";
      paymentStatusColor = "bg-warning/10 text-warning border-warning/20";
    }

    return {
      ...ins, totalSubmitted, totalPaid, totalTax, totalRejected, outstanding,
      claimCount: insClaims.length, paymentStatus, paymentStatusColor,
      claims: insClaims, payments: insPayments, taxRecords: insTax,
    };
  }).filter((a: any) => a.claimCount > 0 || search === "");

  const filteredAggregated = aggregated.filter((a: any) =>
    a.company_name?.toLowerCase().includes(search.toLowerCase())
  );

  const grandTotalSubmitted = aggregated.reduce((s: number, a: any) => s + a.totalSubmitted, 0);
  const grandTotalPaid = aggregated.reduce((s: number, a: any) => s + a.totalPaid, 0);
  const grandTotalTax = aggregated.reduce((s: number, a: any) => s + a.totalTax, 0);
  const grandOutstanding = grandTotalSubmitted - grandTotalPaid - grandTotalTax;
  const grandRejected = aggregated.reduce((s: number, a: any) => s + a.totalRejected, 0);

  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const claimAmount = parseFloat(form.claim_amount) || 0;
      const month = parseInt(form.claim_month);
      const year = parseInt(form.claim_year);

      await insertClaim.mutateAsync({
        insurance_company_id: form.insurance_company_id,
        claim_amount: claimAmount,
        claim_month: month,
        claim_year: year,
        status: "submitted",
      });

      // Auto-calculate and insert withholding tax
      const whtAmount = claimAmount * (taxRate / 100);
      await insertWHT.mutateAsync({
        insurance_company_id: form.insurance_company_id,
        month, year,
        claim_total: claimAmount,
        tax_rate: taxRate,
        tax_amount: whtAmount,
      });

      toast({ title: "Claim submitted", description: `WHT of GH¢ ${whtAmount.toLocaleString()} auto-calculated at ${taxRate}%` });
      setAddDialogOpen(false);
      setForm({ insurance_company_id: "", claim_amount: "", claim_month: "", claim_year: String(new Date().getFullYear()) });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleSubmitRejection = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const rejectedAmount = parseFloat(rejectForm.rejected_amount) || 0;
      const month = parseInt(rejectForm.claim_month);
      const year = parseInt(rejectForm.claim_year);

      await insertClaim.mutateAsync({
        insurance_company_id: rejectForm.insurance_company_id,
        claim_amount: rejectedAmount,
        claim_month: month,
        claim_year: year,
        status: "rejected",
      });

      // Adjust WHT: negative WHT record for the rejected amount
      const whtReduction = rejectedAmount * (taxRate / 100);
      await insertWHT.mutateAsync({
        insurance_company_id: rejectForm.insurance_company_id,
        month, year,
        claim_total: -rejectedAmount,
        tax_rate: taxRate,
        tax_amount: -whtReduction,
      });

      toast({ title: "Rejection recorded", description: `Submitted & WHT adjusted by GH¢ -${whtReduction.toLocaleString()}` });
      setRejectDialogOpen(false);
      setRejectForm({ insurance_company_id: "", rejected_amount: "", claim_month: "", claim_year: String(new Date().getFullYear()) });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  // Detail view with enhanced monthly breakdown
  if (detailInsurer) {
    const ins = aggregated.find((a: any) => a.id === detailInsurer);
    if (!ins) { setDetailInsurer(null); return null; }

    // Build monthly breakdown with all entries
    const monthlyMap: Record<string, { month: number; year: number; submitted: number; rejected: number; wht: number; paid: number }> = {};
    ins.claims.forEach((c: any) => {
      const key = `${c.claim_year}-${c.claim_month}`;
      if (!monthlyMap[key]) monthlyMap[key] = { month: c.claim_month, year: c.claim_year, submitted: 0, rejected: 0, wht: 0, paid: 0 };
      if (c.status === "rejected") {
        monthlyMap[key].rejected += Number(c.claim_amount || 0);
      } else {
        monthlyMap[key].submitted += Number(c.claim_amount || 0);
      }
    });
    ins.taxRecords.forEach((t: any) => {
      const key = `${t.year}-${t.month}`;
      if (!monthlyMap[key]) monthlyMap[key] = { month: t.month, year: t.year, submitted: 0, rejected: 0, wht: 0, paid: 0 };
      monthlyMap[key].wht += Number(t.tax_amount || 0);
    });
    ins.payments.forEach((p: any) => {
      const d = new Date(p.payment_date);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      if (monthlyMap[key]) monthlyMap[key].paid += Number(p.amount_paid || 0);
    });
    const monthlyRows = Object.values(monthlyMap).sort((a, b) => b.year - a.year || b.month - a.month);

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setDetailInsurer(null)}>← Back</Button>
          <div>
            <h1 className="page-title flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ins.color || "#3b82f6" }} />
              {ins.company_name}
            </h1>
            <p className="page-description">Claims profile & account details</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="stat-card text-center">
            <p className="text-2xl font-bold font-heading text-foreground">GH¢ {ins.totalSubmitted.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Submitted</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-2xl font-bold font-heading text-success">GH¢ {ins.totalPaid.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Paid</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-2xl font-bold font-heading text-warning">GH¢ {ins.totalTax.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">WHT Deducted</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-2xl font-bold font-heading text-destructive">GH¢ {ins.totalRejected.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Rejected</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-2xl font-bold font-heading text-destructive">GH¢ {ins.outstanding.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Outstanding</p>
          </div>
        </div>

        <div className="stat-card">
          <h3 className="font-heading font-semibold mb-4">Monthly Claims Breakdown</h3>
          <table className="data-table">
            <thead>
              <tr><th>Period</th><th>Submitted (GH¢)</th><th>WHT (GH¢)</th><th>Rejected (GH¢)</th><th>Paid (GH¢)</th><th>Outstanding (GH¢)</th></tr>
            </thead>
            <tbody>
              {monthlyRows.map((m) => {
                const netOutstanding = m.submitted - m.paid - m.wht;
                return (
                  <tr key={`${m.year}-${m.month}`} className="hover:bg-muted/50 transition-colors">
                    <td className="font-medium">{monthNames[m.month] || "—"} {m.year}</td>
                    <td>GH¢ {m.submitted.toLocaleString()}</td>
                    <td className="text-warning">GH¢ {m.wht.toLocaleString()}</td>
                    <td className="text-destructive">GH¢ {m.rejected.toLocaleString()}</td>
                    <td className="text-success">GH¢ {m.paid.toLocaleString()}</td>
                    <td className="font-semibold text-destructive">GH¢ {netOutstanding.toLocaleString()}</td>
                  </tr>
                );
              })}
              {monthlyRows.length === 0 && (
                <tr><td colSpan={6} className="text-center text-muted-foreground py-6">No claims for this insurer</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="stat-card">
          <h3 className="font-heading font-semibold mb-2">Contact Information</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-muted-foreground">Email:</span> {ins.email || "—"}</div>
            <div><span className="text-muted-foreground">Phone:</span> {ins.phone || "—"}</div>
            <div><span className="text-muted-foreground">Address:</span> {ins.address || "—"}</div>
            <div><span className="text-muted-foreground">Contact:</span> {ins.contact_person || "—"}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Claims Management</h1>
          <p className="page-description">Aggregated claims overview by insurance company — WHT auto-applied at {taxRate}%</p>
        </div>
        <div className="flex gap-2">
          <Button variant="destructive" onClick={() => setRejectDialogOpen(true)} className="gap-2">
            <AlertTriangle className="w-4 h-4" />Submit Rejection
          </Button>
          <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />Submit Claim
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => exportClaimsPDF(filteredAggregated, { grandTotalSubmitted, grandTotalPaid, grandTotalTax, grandOutstanding, grandRejected })}>
            <Download className="w-4 h-4" />PDF
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => exportClaimsExcel(filteredAggregated, { grandTotalSubmitted, grandTotalPaid, grandTotalTax, grandOutstanding, grandRejected })}>
            <Download className="w-4 h-4" />Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="stat-card text-center">
          <p className="text-2xl font-bold font-heading text-foreground">GH¢ {grandTotalSubmitted.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">Total Submitted</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-2xl font-bold font-heading text-success">GH¢ {grandTotalPaid.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">Total Paid</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-2xl font-bold font-heading text-warning">GH¢ {grandTotalTax.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">WHT Deducted</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-2xl font-bold font-heading text-destructive">GH¢ {grandOutstanding.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">Outstanding</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-2xl font-bold font-heading text-destructive">GH¢ {grandRejected.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">Rejected</p>
        </div>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search insurance company..." className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Insurance Company</th><th>Claims</th><th>Submitted (GH¢)</th><th>Paid (GH¢)</th>
                <th>WHT (GH¢)</th><th>Outstanding (GH¢)</th><th>Rejected (GH¢)</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredAggregated.map((a: any) => (
                <tr key={a.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setDetailInsurer(a.id)}>
                  <td className="font-medium">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color || "#3b82f6" }} />
                      <span className="text-primary hover:underline">{a.company_name}</span>
                    </div>
                  </td>
                  <td className="font-semibold">{a.claimCount}</td>
                  <td>{a.totalSubmitted.toLocaleString()}</td>
                  <td className="text-success font-medium">{a.totalPaid.toLocaleString()}</td>
                  <td className="text-warning font-medium">{a.totalTax.toLocaleString()}</td>
                  <td className="text-destructive font-medium">{a.outstanding.toLocaleString()}</td>
                  <td className="text-destructive font-medium">{a.totalRejected.toLocaleString()}</td>
                  <td><Badge variant="outline" className={a.paymentStatusColor}>{a.paymentStatus}</Badge></td>
                </tr>
              ))}
              {filteredAggregated.length === 0 && (
                <tr><td colSpan={8} className="text-center text-muted-foreground py-8">No claims data. Submit claims to get started.</td></tr>
              )}
            </tbody>
            {filteredAggregated.length > 0 && (
              <tfoot>
                <tr className="font-bold bg-muted/30">
                  <td>Grand Total</td>
                  <td>{aggregated.reduce((s: number, a: any) => s + a.claimCount, 0)}</td>
                  <td>{grandTotalSubmitted.toLocaleString()}</td>
                  <td className="text-success">{grandTotalPaid.toLocaleString()}</td>
                  <td className="text-warning">{grandTotalTax.toLocaleString()}</td>
                  <td className="text-destructive">{grandOutstanding.toLocaleString()}</td>
                  <td className="text-destructive">{grandRejected.toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

      {/* Submit Claim Dialog */}
      <EntityDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} title="Submit Monthly Claim">
        <form onSubmit={handleSubmitClaim} className="space-y-4">
          <div>
            <Label>Insurance Company *</Label>
            <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.insurance_company_id} onChange={(e) => setForm({ ...form, insurance_company_id: e.target.value })} required>
              <option value="">Select insurer...</option>
              {(insurers || []).map((i: any) => <option key={i.id} value={i.id}>{i.company_name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Claim Month *</Label>
              <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.claim_month} onChange={(e) => setForm({ ...form, claim_month: e.target.value })} required>
                <option value="">Month...</option>
                {monthNames.slice(1).map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div><Label>Year *</Label><Input value={form.claim_year} onChange={(e) => setForm({ ...form, claim_year: e.target.value })} type="number" required className="mt-1" /></div>
          </div>
          <div><Label>Claim Amount (GH¢) *</Label><Input value={form.claim_amount} onChange={(e) => setForm({ ...form, claim_amount: e.target.value })} type="number" step="0.01" required className="mt-1" /></div>
          {form.claim_amount && (
            <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
              <div><span className="text-muted-foreground">WHT Rate: </span><span className="font-semibold">{taxRate}%</span></div>
              <div><span className="text-muted-foreground">WHT Amount: </span><span className="font-bold text-primary">GH¢ {((parseFloat(form.claim_amount) || 0) * taxRate / 100).toLocaleString()}</span></div>
              <div><span className="text-muted-foreground">Net Payable: </span><span className="font-bold">GH¢ {((parseFloat(form.claim_amount) || 0) * (1 - taxRate / 100)).toLocaleString()}</span></div>
            </div>
          )}
          <Button type="submit" className="w-full" disabled={insertClaim.isPending}>
            {insertClaim.isPending ? "Submitting..." : "Submit Claim"}
          </Button>
        </form>
      </EntityDialog>

      {/* Submit Rejection Dialog */}
      <EntityDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen} title="Submit Rejected Claim">
        <form onSubmit={handleSubmitRejection} className="space-y-4">
          <div>
            <Label>Insurance Company *</Label>
            <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={rejectForm.insurance_company_id} onChange={(e) => setRejectForm({ ...rejectForm, insurance_company_id: e.target.value })} required>
              <option value="">Select insurer...</option>
              {(insurers || []).map((i: any) => <option key={i.id} value={i.id}>{i.company_name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Month *</Label>
              <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={rejectForm.claim_month} onChange={(e) => setRejectForm({ ...rejectForm, claim_month: e.target.value })} required>
                <option value="">Month...</option>
                {monthNames.slice(1).map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div><Label>Year *</Label><Input value={rejectForm.claim_year} onChange={(e) => setRejectForm({ ...rejectForm, claim_year: e.target.value })} type="number" required className="mt-1" /></div>
          </div>
          <div><Label>Rejected Amount (GH¢) *</Label><Input value={rejectForm.rejected_amount} onChange={(e) => setRejectForm({ ...rejectForm, rejected_amount: e.target.value })} type="number" step="0.01" required className="mt-1" /></div>
          {rejectForm.rejected_amount && (
            <div className="p-3 bg-destructive/5 rounded-lg text-sm space-y-1 border border-destructive/20">
              <div><span className="text-muted-foreground">WHT Reduction: </span><span className="font-bold text-destructive">-GH¢ {((parseFloat(rejectForm.rejected_amount) || 0) * taxRate / 100).toLocaleString()}</span></div>
              <p className="text-xs text-muted-foreground">This will reduce the submitted amount and WHT for this period.</p>
            </div>
          )}
          <Button type="submit" variant="destructive" className="w-full" disabled={insertClaim.isPending}>
            {insertClaim.isPending ? "Recording..." : "Submit Rejection"}
          </Button>
        </form>
      </EntityDialog>
    </div>
  );
}
