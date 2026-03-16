import { useState } from "react";
import { Search, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function Outstanding() {
  const { data: claims, isLoading: claimsLoading } = useSupabaseQuery("claims");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: payments } = useSupabaseQuery("payments");
  const { data: withholdingTax } = useSupabaseQuery("withholding_tax");
  const [search, setSearch] = useState("");
  const [detailInsurer, setDetailInsurer] = useState<any>(null);

  const aggregated = (insurers || []).map((ins: any) => {
    const insClaims = (claims || []).filter((c: any) => c.insurance_company_id === ins.id && c.status !== "rejected");
    const totalSubmitted = insClaims.reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
    const insPayments = (payments || []).filter((p: any) => p.insurance_company_id === ins.id);
    const totalPaid = insPayments.reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0);
    const insTax = (withholdingTax || []).filter((t: any) => t.insurance_company_id === ins.id);
    const totalTax = insTax.reduce((s: number, t: any) => s + Number(t.tax_amount || 0), 0);
    const outstanding = totalSubmitted - totalPaid - totalTax;

    // Monthly outstanding breakdown
    const monthlyBreakdown: any[] = [];
    insClaims.forEach((c: any) => {
      const key = `${c.claim_year}-${c.claim_month}`;
      let entry = monthlyBreakdown.find((m: any) => m.key === key);
      if (!entry) {
        entry = { key, month: c.claim_month, year: c.claim_year, submitted: 0, paid: 0, tax: 0 };
        monthlyBreakdown.push(entry);
      }
      entry.submitted += Number(c.claim_amount || 0);
    });
    insPayments.forEach((p: any) => {
      const d = new Date(p.payment_date);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      let entry = monthlyBreakdown.find((m: any) => m.key === key);
      if (entry) entry.paid += Number(p.amount_paid || 0);
    });
    insTax.forEach((t: any) => {
      const key = `${t.year}-${t.month}`;
      let entry = monthlyBreakdown.find((m: any) => m.key === key);
      if (entry) entry.tax += Number(t.tax_amount || 0);
    });

    return { ...ins, totalSubmitted, totalPaid, totalTax, outstanding, monthlyBreakdown };
  }).filter((a: any) => a.outstanding > 0 || search === "");

  const filtered = aggregated.filter((a: any) =>
    a.company_name?.toLowerCase().includes(search.toLowerCase())
  );
  const grandOutstanding = aggregated.reduce((s: number, a: any) => s + a.outstanding, 0);

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
              {ins.company_name} — Outstanding
            </h1>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div className="stat-card text-center">
            <p className="text-2xl font-bold font-heading">GH¢ {ins.totalSubmitted.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Submitted</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-2xl font-bold font-heading text-success">GH¢ {ins.totalPaid.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Paid</p>
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
          <h3 className="font-heading font-semibold mb-4">Monthly Breakdown</h3>
          <table className="data-table">
            <thead><tr><th>Period</th><th>Submitted (GH¢)</th><th>Paid (GH¢)</th><th>WHT (GH¢)</th><th>Outstanding (GH¢)</th></tr></thead>
            <tbody>
              {ins.monthlyBreakdown.sort((a: any, b: any) => b.year - a.year || b.month - a.month).map((m: any) => (
                <tr key={m.key}>
                  <td className="font-medium">{monthNames[m.month]} {m.year}</td>
                  <td>{m.submitted.toLocaleString()}</td>
                  <td className="text-success">{m.paid.toLocaleString()}</td>
                  <td className="text-warning">{m.tax.toLocaleString()}</td>
                  <td className="text-destructive font-semibold">{(m.submitted - m.paid - m.tax).toLocaleString()}</td>
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
          <h1 className="page-title">Outstanding Claims</h1>
          <p className="page-description">View outstanding balances for each insurance company</p>
        </div>
      </div>

      <div className="stat-card text-center">
        <p className="text-sm text-muted-foreground">Total Outstanding</p>
        <p className="text-3xl font-bold font-heading text-destructive mt-1">GH¢ {grandOutstanding.toLocaleString()}</p>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search insurance company..." className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {claimsLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Insurance Company</th><th>Submitted (GH¢)</th><th>Paid (GH¢)</th><th>WHT (GH¢)</th><th>Outstanding (GH¢)</th></tr>
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
                  <td>{a.totalSubmitted.toLocaleString()}</td>
                  <td className="text-success">{a.totalPaid.toLocaleString()}</td>
                  <td className="text-warning">{a.totalTax.toLocaleString()}</td>
                  <td className="text-destructive font-bold">{a.outstanding.toLocaleString()}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="text-center text-muted-foreground py-8">No outstanding claims.</td></tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="font-bold bg-muted/30">
                  <td>Grand Total</td>
                  <td>{aggregated.reduce((s: number, a: any) => s + a.totalSubmitted, 0).toLocaleString()}</td>
                  <td className="text-success">{aggregated.reduce((s: number, a: any) => s + a.totalPaid, 0).toLocaleString()}</td>
                  <td className="text-warning">{aggregated.reduce((s: number, a: any) => s + a.totalTax, 0).toLocaleString()}</td>
                  <td className="text-destructive">{grandOutstanding.toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
}
