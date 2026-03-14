import { useState } from "react";
import { Search, Download, Plus, Eye, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSupabaseQuery, useSupabaseInsert } from "@/hooks/useSupabaseQuery";
import { Label } from "@/components/ui/label";
import EntityDialog from "@/components/shared/EntityDialog";
import { toast } from "@/hooks/use-toast";

const statusStyles: Record<string, string> = {
  submitted: "bg-info/10 text-info border-info/20",
  paid: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
  appealed: "bg-chart-4/10 text-chart-4 border-chart-4/20",
};

export default function Claims() {
  const { data: claims, isLoading: claimsLoading } = useSupabaseQuery("claims");
  const { data: insurers, isLoading: insurersLoading } = useSupabaseQuery("insurance_companies");
  const { data: payments } = useSupabaseQuery("payments");
  const { data: withholdingTax } = useSupabaseQuery("withholding_tax");
  const insertMutation = useSupabaseInsert("claims");
  const [search, setSearch] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [detailInsurer, setDetailInsurer] = useState<any>(null);
  const [form, setForm] = useState({ insurance_company_id: "", claim_amount: "", claim_month: "", claim_year: "2026", patient_name: "", procedure_name: "" });

  const isLoading = claimsLoading || insurersLoading;

  const getInsurerName = (id: string) => (insurers || []).find((i: any) => i.id === id)?.company_name || "Unknown";
  const getInsurerColor = (id: string) => (insurers || []).find((i: any) => i.id === id)?.color || "#3b82f6";

  // Aggregate claims by insurance company
  const aggregated = (insurers || []).map((ins: any) => {
    const insClaims = (claims || []).filter((c: any) => c.insurance_company_id === ins.id);
    const totalSubmitted = insClaims.reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
    const paidClaims = insClaims.filter((c: any) => c.status === "paid");
    const rejectedClaims = insClaims.filter((c: any) => c.status === "rejected");
    const pendingClaims = insClaims.filter((c: any) => c.status === "pending" || c.status === "submitted");
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
      ...ins,
      totalSubmitted,
      totalPaid,
      totalTax,
      outstanding,
      claimCount: insClaims.length,
      paidCount: paidClaims.length,
      rejectedCount: rejectedClaims.length,
      pendingCount: pendingClaims.length,
      paymentStatus,
      paymentStatusColor,
      claims: insClaims,
    };
  }).filter((a: any) => a.claimCount > 0 || search === "");

  const filteredAggregated = aggregated.filter((a: any) =>
    a.company_name?.toLowerCase().includes(search.toLowerCase())
  );

  const grandTotalSubmitted = aggregated.reduce((s: number, a: any) => s + a.totalSubmitted, 0);
  const grandTotalPaid = aggregated.reduce((s: number, a: any) => s + a.totalPaid, 0);
  const grandTotalTax = aggregated.reduce((s: number, a: any) => s + a.totalTax, 0);
  const grandOutstanding = grandTotalSubmitted - grandTotalPaid - grandTotalTax;
  const grandRejected = aggregated.reduce((s: number, a: any) => s + a.rejectedCount, 0);

  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await insertMutation.mutateAsync({
        insurance_company_id: form.insurance_company_id,
        claim_amount: parseFloat(form.claim_amount) || 0,
        claim_month: parseInt(form.claim_month) || new Date().getMonth() + 1,
        claim_year: parseInt(form.claim_year) || new Date().getFullYear(),
        patient_name: form.patient_name || null,
        procedure_name: form.procedure_name || null,
        status: "submitted",
      });
      toast({ title: "Claim submitted successfully" });
      setAddDialogOpen(false);
      setForm({ insurance_company_id: "", claim_amount: "", claim_month: "", claim_year: "2026", patient_name: "", procedure_name: "" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  // Detail view for a specific insurer
  if (detailInsurer) {
    const ins = aggregated.find((a: any) => a.id === detailInsurer);
    if (!ins) { setDetailInsurer(null); return null; }
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
            <p className="text-2xl font-bold font-heading text-info">{ins.claimCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Claims</p>
          </div>
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
            <p className="text-2xl font-bold font-heading text-destructive">GH¢ {ins.outstanding.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Outstanding</p>
          </div>
        </div>

        <div className="stat-card">
          <h3 className="font-heading font-semibold mb-4">Claims Breakdown</h3>
          <table className="data-table">
            <thead>
              <tr><th>Patient</th><th>Procedure</th><th>Amount</th><th>Month</th><th>Status</th><th>Date</th></tr>
            </thead>
            <tbody>
              {ins.claims.map((c: any) => (
                <tr key={c.id} className="hover:bg-muted/50 transition-colors">
                  <td>{c.patient_name || "—"}</td>
                  <td>{c.procedure_name || "—"}</td>
                  <td className="font-semibold">GH¢ {Number(c.claim_amount).toLocaleString()}</td>
                  <td className="text-muted-foreground">{c.claim_month}/{c.claim_year}</td>
                  <td><Badge variant="outline" className={statusStyles[c.status] || ""}>{c.status}</Badge></td>
                  <td className="text-muted-foreground">{c.submission_date}</td>
                </tr>
              ))}
              {ins.claims.length === 0 && (
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
          <p className="page-description">Aggregated claims overview by insurance company</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />Submit Claim
          </Button>
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" />Export
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
          <p className="text-2xl font-bold font-heading text-destructive">{grandRejected}</p>
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
                <th>Insurance Company</th>
                <th>Claims</th>
                <th>Submitted (GH¢)</th>
                <th>Paid (GH¢)</th>
                <th>WHT (GH¢)</th>
                <th>Outstanding (GH¢)</th>
                <th>Rejected</th>
                <th>Status</th>
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
                  <td>{a.rejectedCount}</td>
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
                  <td>{grandRejected}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

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
                {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div><Label>Year *</Label><Input value={form.claim_year} onChange={(e) => setForm({ ...form, claim_year: e.target.value })} type="number" required className="mt-1" /></div>
          </div>
          <div><Label>Claim Amount (GH¢) *</Label><Input value={form.claim_amount} onChange={(e) => setForm({ ...form, claim_amount: e.target.value })} type="number" step="0.01" required className="mt-1" /></div>
          <div><Label>Patient Name</Label><Input value={form.patient_name} onChange={(e) => setForm({ ...form, patient_name: e.target.value })} className="mt-1" /></div>
          <div><Label>Procedure</Label><Input value={form.procedure_name} onChange={(e) => setForm({ ...form, procedure_name: e.target.value })} className="mt-1" /></div>
          <Button type="submit" className="w-full" disabled={insertMutation.isPending}>
            {insertMutation.isPending ? "Submitting..." : "Submit Claim"}
          </Button>
        </form>
      </EntityDialog>
    </div>
  );
}
