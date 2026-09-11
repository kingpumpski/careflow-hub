import { useState } from "react";
import { CheckCircle2, Clock3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSupabaseQuery, useSupabaseUpdate } from "@/hooks/useSupabaseQuery";
import FilterBar from "@/components/shared/FilterBar";
import SortableHeader, { useSort } from "@/components/shared/SortableHeader";
import { toast } from "@/hooks/use-toast";
import { usePermissions } from "@/modules/security/usePermissions";

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type TaxRecord = { id: string; insurance_company_id: string; month: number; year: number; claim_total: number; tax_rate: number; tax_amount: number; is_actual: boolean };
type Insurer = { id: string; company_name: string; color?: string; email?: string; phone?: string; address?: string; contact_person?: string };
type TaxFilters = { company?: string; month?: string; year?: string };

export default function WithholdingTax() {
  const { can, loading: permissionsLoading } = usePermissions();
  const canReadClaims = can("claims.read");
  const canWriteClaims = can("claims.write");
  const { data: taxRecords, isLoading } = useSupabaseQuery("withholding_tax", { enabled: canReadClaims && !permissionsLoading });
  const { data: insurers } = useSupabaseQuery("insurance_companies", { enabled: canReadClaims && !permissionsLoading });
  const { data: settings } = useSupabaseQuery("system_settings", { enabled: canReadClaims && !permissionsLoading });
  const updateWHT = useSupabaseUpdate("withholding_tax");
  const [filters, setFilters] = useState<TaxFilters>({});
  const [detailInsurer, setDetailInsurer] = useState<string | null>(null);
  const currentRate = Number((settings || []).find((s: any) => s.key === "withholding_tax_rate")?.value || "5");

  if (permissionsLoading) return <div className="stat-card py-12 text-center text-muted-foreground">Checking withholding tax access…</div>;
  if (!canReadClaims) return <div className="stat-card py-12 text-center"><h1 className="font-semibold">Withholding tax access restricted</h1><p className="mt-1 text-sm text-muted-foreground">You do not have permission to view withholding tax records.</p></div>;

  const taxRows = (taxRecords || []) as unknown as TaxRecord[];
  const insurerRows = (insurers || []) as unknown as Insurer[];
  const aggregated = insurerRows.map((ins) => {
    let records = taxRows.filter((t) => t.insurance_company_id === ins.id);
    if (filters.month) records = records.filter((t) => t.month === parseInt(filters.month || "0", 10));
    if (filters.year) records = records.filter((t) => t.year === parseInt(filters.year || "0", 10));
    const totalTax = records.reduce((s, t) => s + Number(t.tax_amount || 0), 0);
    const totalClaims = records.reduce((s, t) => s + Number(t.claim_total || 0), 0);
    const actualCount = records.filter((t) => t.is_actual === true).length;
    return { ...ins, records, totalTax, totalClaims, actualCount };
  }).filter((a) => a.records.length > 0);

  let displayData = aggregated;
  if (filters.company) displayData = displayData.filter((a) => a.id === filters.company);
  const { sorted, sort, handleSort } = useSort(displayData);
  const grandTotalTax = displayData.reduce((s, a) => s + a.totalTax, 0);
  const grandTotalClaims = displayData.reduce((s, a) => s + a.totalClaims, 0);

  const confirmActual = async (record: TaxRecord) => {
    if (!canWriteClaims) { toast({ title: "Permission required", description: "You need claims write permission to change WHT settlement state.", variant: "destructive" }); return; }
    try {
      await updateWHT.mutateAsync({ id: record.id, is_actual: !record.is_actual });
      toast({ title: record.is_actual ? "WHT returned to provisional" : "WHT confirmed as actual", description: `${monthNames[record.month]} ${record.year} settlement state updated.` });
    } catch (err: any) {
      toast({ title: "Unable to update WHT", description: err.message || "Please try again.", variant: "destructive" });
    }
  };

  if (detailInsurer) {
    const ins = aggregated.find((a) => a.id === detailInsurer);
    if (!ins) { setDetailInsurer(null); return null; }
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3"><button onClick={() => setDetailInsurer(null)} className="text-sm text-primary hover:underline">← Back</button><h1 className="page-title flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: ins.color || "#3b82f6" }} />{ins.company_name} — WHT Details</h1></div>
        <div className="grid grid-cols-3 gap-3"><div className="stat-card text-center"><p className="text-2xl font-bold font-heading text-primary">{currentRate}%</p><p className="text-xs text-muted-foreground mt-1">Tax Rate</p></div><div className="stat-card text-center"><p className="text-2xl font-bold font-heading">GH¢ {ins.totalClaims.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Claims Base</p></div><div className="stat-card text-center"><p className="text-2xl font-bold font-heading text-warning">GH¢ {ins.totalTax.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">WHT Deducted</p></div></div>
        <div className="stat-card overflow-x-auto"><table className="data-table"><thead><tr><th>Month</th><th>Year</th><th>Claim Total (GH¢)</th><th>Rate</th><th>Tax Amount (GH¢)</th><th>Settlement</th><th>Action</th></tr></thead><tbody>
          {[...ins.records].sort((a, b) => b.year - a.year || b.month - a.month).map((t) => <tr key={t.id} className="hover:bg-muted/50 transition-colors"><td>{monthNames[t.month]}</td><td>{t.year}</td><td>{Number(t.claim_total).toLocaleString()}</td><td>{Number(t.tax_rate)}%</td><td className="font-semibold text-primary">GH¢ {Number(t.tax_amount).toLocaleString()}</td><td><Badge variant="outline" className={t.is_actual ? "bg-success/10 text-success border-success/20" : "bg-warning/10 text-warning border-warning/20"}>{t.is_actual ? <><CheckCircle2 className="w-3 h-3 mr-1" />Actual</> : <><Clock3 className="w-3 h-3 mr-1" />Provisional</>}</Badge></td><td>{canWriteClaims ? <Button size="sm" variant="outline" disabled={updateWHT.isPending} onClick={() => void confirmActual(t)}>{t.is_actual ? "Mark provisional" : "Confirm actual"}</Button> : <span className="text-xs text-muted-foreground">Read only</span>}</td></tr>)}
        </tbody></table></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header"><h1 className="page-title">Withholding Tax</h1><p className="page-description">Auto-calculated WHT is provisional until confirmed as an actual settlement component.</p></div>
      <FilterBar filters={filters} onChange={setFilters} showCompany />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4"><div className="stat-card text-center"><p className="text-sm text-muted-foreground">Current Tax Rate</p><p className="text-2xl font-bold font-heading text-primary mt-1">{currentRate}%</p></div><div className="stat-card text-center"><p className="text-sm text-muted-foreground">Total WHT</p><p className="text-2xl font-bold font-heading mt-1">GH¢ {grandTotalTax.toLocaleString()}</p></div><div className="stat-card text-center"><p className="text-sm text-muted-foreground">Claims Base</p><p className="text-2xl font-bold font-heading mt-1">GH¢ {grandTotalClaims.toLocaleString()}</p></div><div className="stat-card text-center"><p className="text-sm text-muted-foreground">Actual Records</p><p className="text-2xl font-bold font-heading text-success mt-1">{displayData.reduce((s, a) => s + a.actualCount, 0)}</p></div></div>
      <div className="stat-card overflow-x-auto">{isLoading ? <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : <table className="data-table"><thead><tr><SortableHeader label="Insurance Company" sortKey="company_name" currentSort={sort} onSort={handleSort} /><SortableHeader label="Records" sortKey="records.length" currentSort={sort} onSort={handleSort} /><SortableHeader label="Claims Base (GH¢)" sortKey="totalClaims" currentSort={sort} onSort={handleSort} /><SortableHeader label="WHT (GH¢)" sortKey="totalTax" currentSort={sort} onSort={handleSort} /><th>Actual</th></tr></thead><tbody>{sorted.map((a) => <tr key={a.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setDetailInsurer(a.id)}><td className="font-medium"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color || "#3b82f6" }} /><span className="text-primary hover:underline">{a.company_name}</span></div></td><td>{a.records.length}</td><td>{a.totalClaims.toLocaleString()}</td><td className="font-semibold text-warning">GH¢ {a.totalTax.toLocaleString()}</td><td><Badge variant="outline" className="bg-success/10 text-success border-success/20">{a.actualCount}/{a.records.length}</Badge></td></tr>)}{sorted.length === 0 && <tr><td colSpan={5} className="text-center text-muted-foreground py-8">No WHT records.</td></tr>}</tbody>{sorted.length > 0 && <tfoot><tr className="font-bold bg-muted/30"><td>Grand Total</td><td>{displayData.reduce((s, a) => s + a.records.length, 0)}</td><td>{grandTotalClaims.toLocaleString()}</td><td className="text-warning">GH¢ {grandTotalTax.toLocaleString()}</td><td>{displayData.reduce((s, a) => s + a.actualCount, 0)}</td></tr></table>}</div>
    </div>
  );
}