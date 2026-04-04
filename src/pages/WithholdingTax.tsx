import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import FilterBar from "@/components/shared/FilterBar";
import SortableHeader, { useSort } from "@/components/shared/SortableHeader";

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function WithholdingTax() {
  const { data: taxRecords, isLoading } = useSupabaseQuery("withholding_tax");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: settings } = useSupabaseQuery("system_settings");
  const [filters, setFilters] = useState<any>({});
  const [detailInsurer, setDetailInsurer] = useState<any>(null);

  const currentRate = Number(settings?.find?.((s: any) => s.key === "withholding_tax_rate")?.value || "5");

  const aggregated = (insurers || []).map((ins: any) => {
    let records = (taxRecords || []).filter((t: any) => t.insurance_company_id === ins.id);
    if (filters.month) records = records.filter((t: any) => t.month === parseInt(filters.month));
    if (filters.year) records = records.filter((t: any) => t.year === parseInt(filters.year));
    const totalTax = records.reduce((s: number, t: any) => s + Number(t.tax_amount || 0), 0);
    const totalClaims = records.reduce((s: number, t: any) => s + Number(t.claim_total || 0), 0);
    return { ...ins, records, totalTax, totalClaims };
  }).filter((a: any) => a.records.length > 0);

  let displayData = aggregated;
  if (filters.company) displayData = displayData.filter((a: any) => a.id === filters.company);

  const { sorted, sort, handleSort } = useSort(displayData);
  const grandTotalTax = displayData.reduce((s: number, a: any) => s + a.totalTax, 0);
  const grandTotalClaims = displayData.reduce((s: number, a: any) => s + a.totalClaims, 0);

  if (detailInsurer) {
    const ins = aggregated.find((a: any) => a.id === detailInsurer);
    if (!ins) { setDetailInsurer(null); return null; }
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setDetailInsurer(null)} className="text-sm text-primary hover:underline">← Back</button>
          <h1 className="page-title flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: ins.color || "#3b82f6" }} />{ins.company_name} — WHT Details</h1>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="stat-card text-center"><p className="text-2xl font-bold font-heading text-primary">{currentRate}%</p><p className="text-xs text-muted-foreground mt-1">Tax Rate</p></div>
          <div className="stat-card text-center"><p className="text-2xl font-bold font-heading">GH¢ {ins.totalClaims.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Claims Base</p></div>
          <div className="stat-card text-center"><p className="text-2xl font-bold font-heading text-warning">GH¢ {ins.totalTax.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">WHT Deducted</p></div>
        </div>
        <div className="stat-card">
          <table className="data-table">
            <thead><tr><th>Month</th><th>Year</th><th>Claim Total (GH¢)</th><th>Rate</th><th>Tax Amount (GH¢)</th></tr></thead>
            <tbody>
              {ins.records.sort((a: any, b: any) => b.year - a.year || b.month - a.month).map((t: any) => (
                <tr key={t.id} className="hover:bg-muted/50 transition-colors">
                  <td>{monthNames[t.month]}</td><td>{t.year}</td>
                  <td>{Number(t.claim_total).toLocaleString()}</td><td>{Number(t.tax_rate)}%</td>
                  <td className="font-semibold text-primary">GH¢ {Number(t.tax_amount).toLocaleString()}</td>
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
      <div className="page-header"><h1 className="page-title">Withholding Tax</h1><p className="page-description">Auto-calculated from submitted claims at {currentRate}% rate</p></div>
      <FilterBar filters={filters} onChange={setFilters} showCompany />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-card text-center"><p className="text-sm text-muted-foreground">Current Tax Rate</p><p className="text-2xl font-bold font-heading text-primary mt-1">{currentRate}%</p></div>
        <div className="stat-card text-center"><p className="text-sm text-muted-foreground">Total WHT Deducted</p><p className="text-2xl font-bold font-heading mt-1">GH¢ {grandTotalTax.toLocaleString()}</p></div>
        <div className="stat-card text-center"><p className="text-sm text-muted-foreground">Total Claims Base</p><p className="text-2xl font-bold font-heading mt-1">GH¢ {grandTotalClaims.toLocaleString()}</p></div>
      </div>
      <div className="stat-card">
        {isLoading ? <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div> : (
          <table className="data-table">
            <thead><tr>
              <SortableHeader label="Insurance Company" sortKey="company_name" currentSort={sort} onSort={handleSort} />
              <SortableHeader label="Records" sortKey="records.length" currentSort={sort} onSort={handleSort} />
              <SortableHeader label="Claims Base (GH¢)" sortKey="totalClaims" currentSort={sort} onSort={handleSort} />
              <SortableHeader label="WHT Deducted (GH¢)" sortKey="totalTax" currentSort={sort} onSort={handleSort} />
            </tr></thead>
            <tbody>
              {sorted.map((a: any) => (
                <tr key={a.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setDetailInsurer(a.id)}>
                  <td className="font-medium"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color || "#3b82f6" }} /><span className="text-primary hover:underline">{a.company_name}</span></div></td>
                  <td>{a.records.length}</td>
                  <td>{a.totalClaims.toLocaleString()}</td>
                  <td className="font-semibold text-warning">GH¢ {a.totalTax.toLocaleString()}</td>
                </tr>
              ))}
              {sorted.length === 0 && <tr><td colSpan={4} className="text-center text-muted-foreground py-8">No WHT records.</td></tr>}
            </tbody>
            {sorted.length > 0 && (
              <tfoot><tr className="font-bold bg-muted/30"><td>Grand Total</td><td>{displayData.reduce((s: number, a: any) => s + a.records.length, 0)}</td><td>{grandTotalClaims.toLocaleString()}</td><td className="text-warning">GH¢ {grandTotalTax.toLocaleString()}</td></tr></tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
}
