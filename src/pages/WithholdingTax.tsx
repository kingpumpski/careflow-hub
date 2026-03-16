import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function WithholdingTax() {
  const { data: taxRecords, isLoading } = useSupabaseQuery("withholding_tax");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: settings } = useSupabaseQuery("system_settings");
  const [search, setSearch] = useState("");
  const [detailInsurer, setDetailInsurer] = useState<any>(null);

  const currentRate = Number(settings?.find?.((s: any) => s.key === "withholding_tax_rate")?.value || "5");
  const getInsurerName = (id: string) => (insurers || []).find((i: any) => i.id === id)?.company_name || "Unknown";
  const getInsurerColor = (id: string) => (insurers || []).find((i: any) => i.id === id)?.color || "#3b82f6";

  // Aggregate by insurer
  const aggregated = (insurers || []).map((ins: any) => {
    const records = (taxRecords || []).filter((t: any) => t.insurance_company_id === ins.id);
    const totalTax = records.reduce((s: number, t: any) => s + Number(t.tax_amount || 0), 0);
    const totalClaims = records.reduce((s: number, t: any) => s + Number(t.claim_total || 0), 0);
    return { ...ins, records, totalTax, totalClaims };
  }).filter((a: any) => a.records.length > 0);

  const filtered = aggregated.filter((a: any) =>
    a.company_name?.toLowerCase().includes(search.toLowerCase())
  );

  const grandTotalTax = aggregated.reduce((s: number, a: any) => s + a.totalTax, 0);
  const grandTotalClaims = aggregated.reduce((s: number, a: any) => s + a.totalClaims, 0);

  if (detailInsurer) {
    const ins = aggregated.find((a: any) => a.id === detailInsurer);
    if (!ins) { setDetailInsurer(null); return null; }
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setDetailInsurer(null)} className="text-sm text-primary hover:underline">← Back</button>
          <h1 className="page-title flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ins.color || "#3b82f6" }} />
            {ins.company_name} — WHT Details
          </h1>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="stat-card text-center">
            <p className="text-2xl font-bold font-heading text-primary">{currentRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">Tax Rate</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-2xl font-bold font-heading">GH¢ {ins.totalClaims.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Claims Base</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-2xl font-bold font-heading text-warning">GH¢ {ins.totalTax.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">WHT Deducted</p>
          </div>
        </div>
        <div className="stat-card">
          <table className="data-table">
            <thead><tr><th>Month</th><th>Year</th><th>Claim Total (GH¢)</th><th>Rate</th><th>Tax Amount (GH¢)</th></tr></thead>
            <tbody>
              {ins.records.sort((a: any, b: any) => b.year - a.year || b.month - a.month).map((t: any) => (
                <tr key={t.id} className="hover:bg-muted/50 transition-colors">
                  <td>{monthNames[t.month]}</td>
                  <td>{t.year}</td>
                  <td>{Number(t.claim_total).toLocaleString()}</td>
                  <td>{Number(t.tax_rate)}%</td>
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
      <div className="page-header">
        <h1 className="page-title">Withholding Tax</h1>
        <p className="page-description">Auto-calculated from submitted claims at {currentRate}% rate (set in Settings)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-card text-center">
          <p className="text-sm text-muted-foreground">Current Tax Rate</p>
          <p className="text-2xl font-bold font-heading text-primary mt-1">{currentRate}%</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-sm text-muted-foreground">Total WHT Deducted</p>
          <p className="text-2xl font-bold font-heading mt-1">GH¢ {grandTotalTax.toLocaleString()}</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-sm text-muted-foreground">Total Claims Base</p>
          <p className="text-2xl font-bold font-heading mt-1">GH¢ {grandTotalClaims.toLocaleString()}</p>
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
              <tr><th>Insurance Company</th><th>Records</th><th>Claims Base (GH¢)</th><th>WHT Deducted (GH¢)</th></tr>
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
                  <td>{a.records.length}</td>
                  <td>{a.totalClaims.toLocaleString()}</td>
                  <td className="font-semibold text-warning">GH¢ {a.totalTax.toLocaleString()}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="text-center text-muted-foreground py-8">No WHT records. Submit claims to auto-generate.</td></tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="font-bold bg-muted/30">
                  <td>Grand Total</td>
                  <td>{aggregated.reduce((s: number, a: any) => s + a.records.length, 0)}</td>
                  <td>{grandTotalClaims.toLocaleString()}</td>
                  <td className="text-warning">GH¢ {grandTotalTax.toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
}
