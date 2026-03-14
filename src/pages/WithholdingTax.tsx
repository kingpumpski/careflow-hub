import { useState } from "react";
import { Calculator, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import EntityDialog from "@/components/shared/EntityDialog";
import { useSupabaseQuery, useSupabaseInsert } from "@/hooks/useSupabaseQuery";
import { toast } from "@/hooks/use-toast";

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function WithholdingTax() {
  const { data: taxRecords, isLoading } = useSupabaseQuery("withholding_tax");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const insertMutation = useSupabaseInsert("withholding_tax");
  const [search, setSearch] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [form, setForm] = useState({ insurance_company_id: "", month: "", year: "2026", claim_total: "", tax_rate: "5" });

  const getInsurerName = (id: string) => (insurers || []).find((i: any) => i.id === id)?.company_name || "Unknown";

  const totalTax = (taxRecords || []).reduce((s: number, t: any) => s + Number(t.tax_amount || 0), 0);
  const totalClaims = (taxRecords || []).reduce((s: number, t: any) => s + Number(t.claim_total || 0), 0);
  const currentRate = (taxRecords || []).length > 0 ? Number((taxRecords as any[])[0]?.tax_rate || 5) : 5;

  const filtered = (taxRecords || []).filter((t: any) =>
    getInsurerName(t.insurance_company_id).toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const claimTotal = parseFloat(form.claim_total) || 0;
    const taxRate = parseFloat(form.tax_rate) || 5;
    const taxAmount = claimTotal * (taxRate / 100);
    try {
      await insertMutation.mutateAsync({
        insurance_company_id: form.insurance_company_id,
        month: parseInt(form.month),
        year: parseInt(form.year),
        claim_total: claimTotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
      });
      toast({ title: "WHT record added", description: `Tax: GH¢ ${taxAmount.toLocaleString()}` });
      setAddDialogOpen(false);
      setForm({ insurance_company_id: "", month: "", year: "2026", claim_total: "", tax_rate: "5" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Withholding Tax</h1>
          <p className="page-description">Automatic withholding tax computation by insurer</p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />Add WHT Record
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Current Tax Rate</p>
          <p className="text-2xl font-bold font-heading text-primary mt-1">{currentRate}%</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Total WHT Deducted</p>
          <p className="text-2xl font-bold font-heading mt-1">GH¢ {totalTax.toLocaleString()}</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Total Claims Base</p>
          <p className="text-2xl font-bold font-heading mt-1">GH¢ {totalClaims.toLocaleString()}</p>
        </div>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by insurer..." className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Insurance Company</th>
                <th>Month</th>
                <th>Year</th>
                <th>Claim Total (GH¢)</th>
                <th>Tax Rate</th>
                <th>Tax Amount (GH¢)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t: any) => (
                <tr key={t.id} className="hover:bg-muted/50 transition-colors">
                  <td className="font-medium">{getInsurerName(t.insurance_company_id)}</td>
                  <td>{monthNames[t.month] || t.month}</td>
                  <td>{t.year}</td>
                  <td>{Number(t.claim_total).toLocaleString()}</td>
                  <td>{Number(t.tax_rate)}%</td>
                  <td className="font-semibold text-primary">GH¢ {Number(t.tax_amount).toLocaleString()}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center text-muted-foreground py-8">No WHT records. Add records to get started.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <EntityDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} title="Add WHT Record">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Insurance Company *</Label>
            <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.insurance_company_id} onChange={(e) => setForm({ ...form, insurance_company_id: e.target.value })} required>
              <option value="">Select insurer...</option>
              {(insurers || []).map((i: any) => <option key={i.id} value={i.id}>{i.company_name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Month *</Label>
              <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} required>
                <option value="">Month...</option>
                {monthNames.slice(1).map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div><Label>Year *</Label><Input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} type="number" required className="mt-1" /></div>
          </div>
          <div><Label>Claim Total (GH¢) *</Label><Input value={form.claim_total} onChange={(e) => setForm({ ...form, claim_total: e.target.value })} type="number" step="0.01" required className="mt-1" /></div>
          <div><Label>Tax Rate (%) *</Label><Input value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} type="number" step="0.01" required className="mt-1" /></div>
          {form.claim_total && form.tax_rate && (
            <div className="p-3 bg-muted rounded-lg text-sm">
              <span className="text-muted-foreground">Computed Tax: </span>
              <span className="font-bold text-primary">GH¢ {((parseFloat(form.claim_total) || 0) * (parseFloat(form.tax_rate) || 0) / 100).toLocaleString()}</span>
            </div>
          )}
          <Button type="submit" className="w-full" disabled={insertMutation.isPending}>
            {insertMutation.isPending ? "Adding..." : "Add Record"}
          </Button>
        </form>
      </EntityDialog>
    </div>
  );
}
