import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import FilterBar from "@/components/shared/FilterBar";
import SortableHeader, { useSort } from "@/components/shared/SortableHeader";

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const categoryLabels: Record<string, string> = {
  coding_error: "Coding Error",
  missing_authorization: "Missing Authorization",
  missing_documentation: "Missing Documentation",
  not_covered: "Service Not Covered",
  duplicate_claim: "Duplicate Claim",
  tariff_dispute: "Tariff Dispute",
  eligibility: "Eligibility Issue",
  late_submission: "Late Submission",
  other: "Other",
  uncategorized: "Uncategorized",
};

export default function Rejections() {
  const { data: claims, isLoading } = useSupabaseQuery("claims");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: withholdingTax } = useSupabaseQuery("withholding_tax");
  const [filters, setFilters] = useState<any>({});
  const [detailInsurer, setDetailInsurer] = useState<any>(null);

  let rejectedClaims = (claims || []).filter((c: any) => c.status === "rejected");
  if (filters.month) rejectedClaims = rejectedClaims.filter((c: any) => c.claim_month === parseInt(filters.month));
  if (filters.year) rejectedClaims = rejectedClaims.filter((c: any) => c.claim_year === parseInt(filters.year));
  if (filters.company) rejectedClaims = rejectedClaims.filter((c: any) => c.insurance_company_id === filters.company);

  // Category analysis
  const byCategory: Record<string, { count: number; amount: number }> = {};
  rejectedClaims.forEach((c: any) => {
    const key = c.denial_category || "uncategorized";
    if (!byCategory[key]) byCategory[key] = { count: 0, amount: 0 };
    byCategory[key].count += 1;
    byCategory[key].amount += Number(c.claim_amount || 0);
  });
  const categoryRows = Object.entries(byCategory)
    .map(([key, v]) => ({ key, label: categoryLabels[key] || key, ...v }))
    .sort((a, b) => b.amount - a.amount);
  const totalRejectedAmt = rejectedClaims.reduce((s, c: any) => s + Number(c.claim_amount || 0), 0);

  const aggregated = (insurers || []).map((ins: any) => {
    const insRejected = rejectedClaims.filter((c: any) => c.insurance_company_id === ins.id);
    const totalRejected = insRejected.reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
    const insWht = (withholdingTax || []).filter((t: any) => t.insurance_company_id === ins.id && Number(t.claim_total || 0) < 0);
    const totalWhtReduction = insWht.reduce((s: number, t: any) => s + Math.abs(Number(t.tax_amount || 0)), 0);
    return { ...ins, claims: insRejected, totalRejected, totalWhtReduction, count: insRejected.length };
  }).filter((a: any) => a.count > 0);

  let displayData = aggregated;
  if (filters.company) displayData = displayData.filter((a: any) => a.id === filters.company);

  const { sorted, sort, handleSort } = useSort(displayData);
  const grandTotalRejected = displayData.reduce((s: number, a: any) => s + a.totalRejected, 0);
  const grandTotalWhtReduction = displayData.reduce((s: number, a: any) => s + a.totalWhtReduction, 0);

  if (detailInsurer) {
    const ins = aggregated.find((a: any) => a.id === detailInsurer);
    if (!ins) { setDetailInsurer(null); return null; }
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setDetailInsurer(null)}>← Back</Button>
          <h1 className="page-title flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: ins.color || "#3b82f6" }} />{ins.company_name} — Rejections</h1>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="stat-card text-center"><p className="text-2xl font-bold font-heading text-destructive">GH¢ {ins.totalRejected.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Total Rejected</p></div>
          <div className="stat-card text-center"><p className="text-2xl font-bold font-heading text-warning">GH¢ {ins.totalWhtReduction.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">WHT Adjusted</p></div>
        </div>
        <div className="stat-card">
          <table className="data-table">
            <thead><tr><th>Month</th><th>Year</th><th>Amount (GH¢)</th><th>Date Submitted</th></tr></thead>
            <tbody>
              {ins.claims.sort((a: any, b: any) => (b.claim_year || 0) - (a.claim_year || 0) || (b.claim_month || 0) - (a.claim_month || 0)).map((c: any) => (
                <tr key={c.id} className="hover:bg-muted/50 transition-colors">
                  <td className="font-medium">{monthNames[c.claim_month] || "—"}</td>
                  <td>{c.claim_year}</td>
                  <td className="font-semibold text-destructive">GH¢ {Number(c.claim_amount).toLocaleString()}</td>
                  <td className="text-muted-foreground">{c.submission_date}</td>
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
      <div className="page-header"><h1 className="page-title">Claim Rejections</h1><p className="page-description">Track rejected claims. Rejections are submitted from the Claims page.</p></div>
      <FilterBar filters={filters} onChange={setFilters} showCompany />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="stat-card text-center"><p className="text-sm text-muted-foreground">Total Rejected</p><p className="text-2xl font-bold font-heading text-destructive mt-1">GH¢ {grandTotalRejected.toLocaleString()}</p></div>
        <div className="stat-card text-center"><p className="text-sm text-muted-foreground">WHT Adjustments</p><p className="text-2xl font-bold font-heading text-warning mt-1">GH¢ {grandTotalWhtReduction.toLocaleString()}</p></div>
      </div>

      {categoryRows.length > 0 && (
        <div className="stat-card">
          <h3 className="font-heading font-semibold mb-3">Rejection Analysis by Category</h3>
          <table className="data-table">
            <thead><tr><th>Category</th><th>Count</th><th>Amount (GH¢)</th><th>% of Total</th></tr></thead>
            <tbody>
              {categoryRows.map((r) => (
                <tr key={r.key}>
                  <td className="font-medium"><Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">{r.label}</Badge></td>
                  <td>{r.count}</td>
                  <td className="font-semibold text-destructive">{r.amount.toLocaleString()}</td>
                  <td>{totalRejectedAmt > 0 ? `${((r.amount / totalRejectedAmt) * 100).toFixed(1)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="stat-card">
        {isLoading ? <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div> : (
          <table className="data-table">
            <thead><tr>
              <SortableHeader label="Insurance Company" sortKey="company_name" currentSort={sort} onSort={handleSort} />
              <SortableHeader label="Rejections" sortKey="count" currentSort={sort} onSort={handleSort} />
              <SortableHeader label="Total Rejected (GH¢)" sortKey="totalRejected" currentSort={sort} onSort={handleSort} />
              <SortableHeader label="WHT Adjusted (GH¢)" sortKey="totalWhtReduction" currentSort={sort} onSort={handleSort} />
            </tr></thead>
            <tbody>
              {sorted.map((a: any) => (
                <tr key={a.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setDetailInsurer(a.id)}>
                  <td className="font-medium"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color || "#3b82f6" }} /><span className="text-primary hover:underline">{a.company_name}</span></div></td>
                  <td>{a.count}</td>
                  <td className="text-destructive font-semibold">GH¢ {a.totalRejected.toLocaleString()}</td>
                  <td className="text-warning font-medium">GH¢ {a.totalWhtReduction.toLocaleString()}</td>
                </tr>
              ))}
              {sorted.length === 0 && <tr><td colSpan={4} className="text-center text-muted-foreground py-8">No rejections recorded.</td></tr>}
            </tbody>
            {sorted.length > 0 && (
              <tfoot><tr className="font-bold bg-muted/30"><td>Grand Total</td><td>{displayData.reduce((s: number, a: any) => s + a.count, 0)}</td><td className="text-destructive">GH¢ {grandTotalRejected.toLocaleString()}</td><td className="text-warning">GH¢ {grandTotalWhtReduction.toLocaleString()}</td></tr></tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
}
