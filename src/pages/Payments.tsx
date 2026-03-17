import { useState } from "react";
import { Search, Plus, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import EntityDialog from "@/components/shared/EntityDialog";
import { useSupabaseQuery, useSupabaseInsert } from "@/hooks/useSupabaseQuery";
import { toast } from "@/hooks/use-toast";

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function Payments() {
  const { data: payments, isLoading } = useSupabaseQuery("payments");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: claims } = useSupabaseQuery("claims");
  const { data: withholdingTax } = useSupabaseQuery("withholding_tax");
  const insertMutation = useSupabaseInsert("payments");
  const [search, setSearch] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [detailInsurer, setDetailInsurer] = useState<any>(null);
  const [form, setForm] = useState({ insurance_company_id: "", amount_paid: "", payment_method: "Bank Transfer", reference_number: "", payment_date: new Date().toISOString().split("T")[0] });

  const aggregated = (insurers || []).map((ins: any) => {
    const insPayments = (payments || []).filter((p: any) => p.insurance_company_id === ins.id);
    const totalPaid = insPayments.reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0);
    const insClaims = (claims || []).filter((c: any) => c.insurance_company_id === ins.id && c.status !== "rejected");
    const totalSubmitted = insClaims.reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
    const insTax = (withholdingTax || []).filter((t: any) => t.insurance_company_id === ins.id);
    const totalTax = insTax.reduce((s: number, t: any) => s + Number(t.tax_amount || 0), 0);
    return {
      ...ins, totalPaid, totalSubmitted, totalTax,
      outstanding: totalSubmitted - totalPaid - totalTax,
      paymentCount: insPayments.length,
      payments: insPayments,
    };
  }).filter((a: any) => a.paymentCount > 0 || search === "");

  const filtered = aggregated.filter((a: any) =>
    a.company_name?.toLowerCase().includes(search.toLowerCase())
  );

  const grandPaid = aggregated.reduce((s: number, a: any) => s + a.totalPaid, 0);
  const grandSubmitted = aggregated.reduce((s: number, a: any) => s + a.totalSubmitted, 0);
  const grandTax = aggregated.reduce((s: number, a: any) => s + a.totalTax, 0);
  const grandOutstanding = grandSubmitted - grandPaid - grandTax;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await insertMutation.mutateAsync({
        insurance_company_id: form.insurance_company_id || null,
        amount_paid: parseFloat(form.amount_paid) || 0,
        payment_method: form.payment_method,
        reference_number: form.reference_number || null,
        payment_date: form.payment_date,
      });
      toast({ title: "Payment recorded" });
      setAddDialogOpen(false);
      setForm({ insurance_company_id: "", amount_paid: "", payment_method: "Bank Transfer", reference_number: "", payment_date: new Date().toISOString().split("T")[0] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

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
              {ins.company_name} — Payments
            </h1>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div className="stat-card text-center">
            <p className="text-2xl font-bold font-heading text-success">GH¢ {ins.totalPaid.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Paid</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-2xl font-bold font-heading text-foreground">GH¢ {ins.totalSubmitted.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Submitted</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-2xl font-bold font-heading text-warning">GH¢ {ins.totalTax.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">WHT</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-2xl font-bold font-heading text-destructive">GH¢ {ins.outstanding.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Outstanding</p>
          </div>
        </div>
        <div className="stat-card">
          <h3 className="font-heading font-semibold mb-4">Payment History</h3>
          <table className="data-table">
            <thead><tr><th>Date</th><th>Amount (GH¢)</th><th>Method</th><th>Reference</th></tr></thead>
            <tbody>
              {ins.payments.sort((a: any, b: any) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()).map((p: any) => (
                <tr key={p.id} className="hover:bg-muted/50 transition-colors">
                  <td className="font-medium">{p.payment_date}</td>
                  <td className="font-semibold text-success">GH¢ {Number(p.amount_paid).toLocaleString()}</td>
                  <td><Badge variant="secondary">{p.payment_method || "—"}</Badge></td>
                  <td className="text-muted-foreground font-mono text-xs">{p.reference_number || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Payment Tracking</h1>
          <p className="page-description">Monitor payments received from insurance companies</p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />Record Payment
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card text-center">
          <p className="text-sm text-muted-foreground">Total Received</p>
          <p className="text-2xl font-bold font-heading text-success mt-1">GH¢ {grandPaid.toLocaleString()}</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-sm text-muted-foreground">Total Submitted</p>
          <p className="text-2xl font-bold font-heading text-foreground mt-1">GH¢ {grandSubmitted.toLocaleString()}</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-sm text-muted-foreground">WHT Deducted</p>
          <p className="text-2xl font-bold font-heading text-warning mt-1">GH¢ {grandTax.toLocaleString()}</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-sm text-muted-foreground">Outstanding</p>
          <p className="text-2xl font-bold font-heading text-destructive mt-1">GH¢ {grandOutstanding.toLocaleString()}</p>
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
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Insurance Company</th><th>Payments</th><th>Total Paid (GH¢)</th><th>Submitted (GH¢)</th><th>WHT (GH¢)</th><th>Outstanding (GH¢)</th></tr>
            </thead>
            <tbody>
              {filtered.map((a: any) => (
                <tr key={a.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setDetailInsurer(a.id)}>
                  <td className="font-medium">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color || "#3b82f6" }} />
                      <span className="text-primary hover:underline">{a.company_name}</span>
                    </div>
                  </td>
                  <td>{a.paymentCount}</td>
                  <td className="text-success font-semibold">{a.totalPaid.toLocaleString()}</td>
                  <td>{a.totalSubmitted.toLocaleString()}</td>
                  <td className="text-warning">{a.totalTax.toLocaleString()}</td>
                  <td className="text-destructive font-medium">{a.outstanding.toLocaleString()}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center text-muted-foreground py-8">No payments recorded.</td></tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="font-bold bg-muted/30">
                  <td>Grand Total</td>
                  <td>{aggregated.reduce((s: number, a: any) => s + a.paymentCount, 0)}</td>
                  <td className="text-success">{grandPaid.toLocaleString()}</td>
                  <td>{grandSubmitted.toLocaleString()}</td>
                  <td className="text-warning">{grandTax.toLocaleString()}</td>
                  <td className="text-destructive">{grandOutstanding.toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

      <EntityDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} title="Record Payment">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Insurance Company *</Label>
            <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.insurance_company_id} onChange={(e) => setForm({ ...form, insurance_company_id: e.target.value })} required>
              <option value="">Select insurer...</option>
              {(insurers || []).map((i: any) => <option key={i.id} value={i.id}>{i.company_name}</option>)}
            </select>
          </div>
          <div><Label>Amount Paid (GH¢) *</Label><Input value={form.amount_paid} onChange={(e) => setForm({ ...form, amount_paid: e.target.value })} type="number" step="0.01" required className="mt-1" /></div>
          <div><Label>Payment Date *</Label><Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} required className="mt-1" /></div>
          <div>
            <Label>Payment Method</Label>
            <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Cheque">Cheque</option>
              <option value="Mobile Money">Mobile Money</option>
              <option value="Cash">Cash</option>
            </select>
          </div>
          <div><Label>Reference / Cheque Number</Label><Input value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} placeholder="e.g. CHQ-00123" className="mt-1" /></div>
          <Button type="submit" className="w-full" disabled={insertMutation.isPending}>
            {insertMutation.isPending ? "Recording..." : "Record Payment"}
          </Button>
        </form>
      </EntityDialog>
    </div>
  );
}
