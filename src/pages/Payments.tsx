import { useState } from "react";
import { CreditCard, Search, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import EntityDialog from "@/components/shared/EntityDialog";
import { useSupabaseQuery, useSupabaseInsert } from "@/hooks/useSupabaseQuery";
import { toast } from "@/hooks/use-toast";

export default function Payments() {
  const { data: payments, isLoading } = useSupabaseQuery("payments");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: claims } = useSupabaseQuery("claims");
  const insertMutation = useSupabaseInsert("payments");
  const [search, setSearch] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [form, setForm] = useState({ insurance_company_id: "", amount_paid: "", payment_method: "Bank Transfer", reference_number: "", claim_id: "" });

  const getInsurerName = (id: string) => (insurers || []).find((i: any) => i.id === id)?.company_name || "—";

  const totalReceived = (payments || []).reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0);
  const totalClaims = (claims || []).reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
  const outstanding = totalClaims - totalReceived;

  const now = new Date();
  const thisMonthPayments = (payments || []).filter((p: any) => {
    const d = new Date(p.payment_date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const thisMonthTotal = thisMonthPayments.reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0);

  const filtered = (payments || []).filter((p: any) =>
    getInsurerName(p.insurance_company_id).toLowerCase().includes(search.toLowerCase()) ||
    p.reference_number?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await insertMutation.mutateAsync({
        insurance_company_id: form.insurance_company_id || null,
        amount_paid: parseFloat(form.amount_paid) || 0,
        payment_method: form.payment_method,
        reference_number: form.reference_number || null,
        claim_id: form.claim_id || null,
      });
      toast({ title: "Payment recorded" });
      setAddDialogOpen(false);
      setForm({ insurance_company_id: "", amount_paid: "", payment_method: "Bank Transfer", reference_number: "", claim_id: "" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Total Received</p>
          <p className="text-2xl font-bold font-heading text-success mt-1">GH¢ {totalReceived.toLocaleString()}</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Outstanding</p>
          <p className="text-2xl font-bold font-heading text-warning mt-1">GH¢ {outstanding.toLocaleString()}</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">This Month</p>
          <p className="text-2xl font-bold font-heading text-primary mt-1">GH¢ {thisMonthTotal.toLocaleString()}</p>
        </div>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search payments..." className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Insurance Company</th>
                <th>Amount (GH¢)</th>
                <th>Date</th>
                <th>Method</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p: any) => (
                <tr key={p.id} className="hover:bg-muted/50 transition-colors">
                  <td className="font-medium">{getInsurerName(p.insurance_company_id)}</td>
                  <td className="font-semibold text-success">GH¢ {Number(p.amount_paid).toLocaleString()}</td>
                  <td className="text-muted-foreground">{p.payment_date}</td>
                  <td><Badge variant="secondary">{p.payment_method || "—"}</Badge></td>
                  <td className="text-muted-foreground font-mono text-xs">{p.reference_number || "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="text-center text-muted-foreground py-8">No payments recorded yet.</td></tr>
              )}
            </tbody>
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
          <div>
            <Label>Payment Method</Label>
            <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Cheque">Cheque</option>
              <option value="Mobile Money">Mobile Money</option>
              <option value="Cash">Cash</option>
            </select>
          </div>
          <div><Label>Reference Number</Label><Input value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} className="mt-1" /></div>
          <Button type="submit" className="w-full" disabled={insertMutation.isPending}>
            {insertMutation.isPending ? "Recording..." : "Record Payment"}
          </Button>
        </form>
      </EntityDialog>
    </div>
  );
}
