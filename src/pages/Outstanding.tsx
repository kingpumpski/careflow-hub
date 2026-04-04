import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import FilterBar from "@/components/shared/FilterBar";
import SortableHeader, { useSort } from "@/components/shared/SortableHeader";

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function Outstanding() {
  const { data: claims, isLoading: claimsLoading } = useSupabaseQuery("claims");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: payments } = useSupabaseQuery("payments");
  const { data: withholdingTax } = useSupabaseQuery("withholding_tax");
  const [filters, setFilters] = useState<any>({});
  const [detailInsurer, setDetailInsurer] = useState<any>(null);

  const aggregated = (insurers || []).map((ins: any) => {
    let insClaims = (claims || []).filter((c: any) => c.insurance_company_id === ins.id && c.status !== "rejected");
    let insRejected = (claims || []).filter((c: any) => c.insurance_company_id === ins.id && c.status === "rejected");
    let insPayments = (payments || []).filter((p: any) => p.insurance_company_id === ins.id);
    let insTax = (withholdingTax || []).filter((t: any) => t.insurance_company_id === ins.id);

    if (filters.month) {
      const m = parseInt(filters.month);
      insClaims = insClaims.filter((c: any) => c.claim_month === m);
      insRejected = insRejected.filter((c: any) => c.claim_month === m);
      insTax = insTax.filter((t: any) => t.month === m);
      insPayments = insPayments.filter((p: any) => p.claim_month === m);
    }
    if (filters.year) {
      const y = parseInt(filters.year);
      insClaims = insClaims.filter((c: any) => c.claim_year === y);
      insRejected = insRejected.filter((c: any) => c.claim_year === y);
      insTax = insTax.filter((t: any) => t.year === y);
      insPayments = insPayments.filter((p: any) => p.claim_year === y);
    }

    const totalSubmitted = insClaims.reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
    const totalRejected = insRejected.reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
    const totalPaid = insPayments.reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0);
    const totalTax = insTax.reduce((s: number, t: any) => s + Number(t.tax_amount || 0), 0);
    const netClaim = totalSubmitted - totalRejected;
    const outstanding = netClaim - totalPaid - totalTax;

    const monthlyBreakdown: any[] = [];
    insClaims.forEach((c: any) => {
      const key = `${c.claim_year}-${c.claim_month}`;
      let entry = monthlyBreakdown.find((m: any) => m.key === key);
      if (!entry) { entry = { key, month: c.claim_month, year: c.claim_year, submitted: 0, rejected: 0, paid: 0, tax: 0 }; monthlyBreakdown.push(entry); }
      entry.submitted += Number(c.claim_amount || 0);
    });
    insRejected.forEach((c: any) => {
      const key = `${c.claim_year}-${c.claim_month}`;
      let entry = monthlyBreakdown.find((m: any) => m.key === key);
      if (!entry) { entry = { key, month: c.claim_month, year: c.claim_year, submitted: 0, rejected: 0, paid: 0, tax: 0 }; monthlyBreakdown.push(entry); }
      entry.rejected += Number(c.claim_amount || 0);
    });
    insPayments.forEach((p: any) => {
      const key = `${p.claim_year}-${p.claim_month}`;
      let entry = monthlyBreakdown.find((m: any) => m.key === key);
      if (entry) entry.paid += Number(p.amount_paid || 0);
    });
    insTax.forEach((t: any) => {
      const key = `${t.year}-${t.month}`;
      let entry = monthlyBreakdown.find((m: any) => m.key === key);
      if (entry) entry.tax += Number(t.tax_amount || 0);
    });

    return { ...ins, totalSubmitted, totalRejected, totalPaid, totalTax, netClaim, outstanding, monthlyBreakdown };
  });

  let displayData = aggregated;
  if (filters.company) displayData = displayData.filter((a: any) => a.id === filters.company);

  const { sorted, sort, handleSort } = useSort(displayData);
  const grandOutstanding = displayData.reduce((s: number, a: any) => s + a.outstanding, 0);

  if (detailInsurer) {
    const ins = aggregated.find((a: any) => a.id === detailInsurer);
    if (!ins) { setDetailInsurer(null); return null; }
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setDetailInsurer(null)}>← Back</Button>
          <div><h1 className="page-title flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: ins.color || "#3b82f6" }} />{ins.company_name} — Outstanding</h1></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="stat-card text-center"><p className="text-2xl font-bold font-heading">GH¢ {ins.totalSubmitted.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Submitted</p></div>
          <div className="stat-card text-center"><p className="text-2xl font-bold font-heading text-destructive">GH¢ {ins.totalRejected.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Rejected</p></div>
          <div className="stat-card text-center"><p className="text-2xl font-bold font-heading text-success">GH¢ {ins.totalPaid.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Paid</p></div>
          <div className="stat-card text-center"><p className="text-2xl font-bold font-heading text-warning">GH¢ {ins.totalTax.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">WHT</p></div>
          <div className="stat-card text-center"><p className="text-2xl font-bold font-heading text-destructive">GH¢ {ins.outstanding.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Outstanding</p></div>
        </div>
        <div className="stat-card">
          <h3 className="font-heading font-semibold mb-4">Monthly Breakdown</h3>
          <table className="data-table">
            <thead><tr><th>Period</th><th>Submitted</th><th>Rejected</th><th>Net Claim</th><th>Paid</th><th>WHT</th><th>Outstanding</th></tr></thead>
            <tbody>
              {ins.monthlyBreakdown.sort((a: any, b: any) => b.year - a.year || b.month - a.month).map((m: any) => {
                const net = m.submitted - m.rejected;
                return (
                  <tr key={m.key}>
                    <td className="font-medium">{monthNames[m.month]} {m.year}</td>
                    <td>{m.submitted.toLocaleString()}</td>
                    <td className="text-destructive">{m.rejected.toLocaleString()}</td>
                    <td className="font-medium">{net.toLocaleString()}</td>
                    <td className="text-success">{m.paid.toLocaleString()}</td>
                    <td className="text-warning">{m.tax.toLocaleString()}</td>
                    <td className="text-destructive font-semibold">{(net - m.paid - m.tax).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header"><h1 className="page-title">Outstanding Claims</h1><p className="page-description">Outstanding = Net Claim − Paid − WHT</p></div>
      <FilterBar filters={filters} onChange={setFilters} showCompany />
      <div className="stat-card text-center"><p className="text-sm text-muted-foreground">Total Outstanding</p><p className="text-3xl font-bold font-heading text-destructive mt-1">GH¢ {grandOutstanding.toLocaleString()}</p></div>
      <div className="stat-card">
        {claimsLoading ? <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div> : (
          <table className="data-table">
            <thead><tr>
              <SortableHeader label="Insurance Company" sortKey="company_name" currentSort={sort} onSort={handleSort} />
              <SortableHeader label="Submitted" sortKey="totalSubmitted" currentSort={sort} onSort={handleSort} />
              <SortableHeader label="Rejected" sortKey="totalRejected" currentSort={sort} onSort={handleSort} />
              <SortableHeader label="Paid" sortKey="totalPaid" currentSort={sort} onSort={handleSort} />
              <SortableHeader label="WHT" sortKey="totalTax" currentSort={sort} onSort={handleSort} />
              <SortableHeader label="Outstanding" sortKey="outstanding" currentSort={sort} onSort={handleSort} />
            </tr></thead>
            <tbody>
              {sorted.map((a: any) => (
                <tr key={a.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setDetailInsurer(a.id)}>
                  <td className="font-medium"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color || "#3b82f6" }} /><span className="text-primary hover:underline">{a.company_name}</span></div></td>
                  <td>{a.totalSubmitted.toLocaleString()}</td>
                  <td className="text-destructive">{a.totalRejected.toLocaleString()}</td>
                  <td className="text-success">{a.totalPaid.toLocaleString()}</td>
                  <td className="text-warning">{a.totalTax.toLocaleString()}</td>
                  <td className="text-destructive font-bold">{a.outstanding.toLocaleString()}</td>
                </tr>
              ))}
              {sorted.length === 0 && <tr><td colSpan={6} className="text-center text-muted-foreground py-8">No outstanding claims.</td></tr>}
            </tbody>
            {sorted.length > 0 && (
              <tfoot><tr className="font-bold bg-muted/30">
                <td>Grand Total</td>
                <td>{displayData.reduce((s: number, a: any) => s + a.totalSubmitted, 0).toLocaleString()}</td>
                <td className="text-destructive">{displayData.reduce((s: number, a: any) => s + a.totalRejected, 0).toLocaleString()}</td>
                <td className="text-success">{displayData.reduce((s: number, a: any) => s + a.totalPaid, 0).toLocaleString()}</td>
                <td className="text-warning">{displayData.reduce((s: number, a: any) => s + a.totalTax, 0).toLocaleString()}</td>
                <td className="text-destructive">{grandOutstanding.toLocaleString()}</td>
              </tr></tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
}
