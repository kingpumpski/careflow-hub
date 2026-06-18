import { useMemo } from "react";
import { Shield, TrendingUp, TrendingDown } from "lucide-react";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import SortableHeader, { useSort } from "@/components/shared/SortableHeader";

export default function InsurerScorecard() {
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: claims } = useSupabaseQuery("claims");
  const { data: payments } = useSupabaseQuery("payments");

  const rows = useMemo(() => {
    return (insurers || []).map((ins: any) => {
      const insClaims = (claims || []).filter((c: any) => c.insurance_company_id === ins.id);
      const insPayments = (payments || []).filter((p: any) => p.insurance_company_id === ins.id);
      const submitted = insClaims.reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
      const rejected = insClaims.filter((c: any) => c.status === "rejected").reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
      const paid = insPayments.reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0);
      const outstanding = submitted - rejected - paid;
      const denialRate = submitted > 0 ? (rejected / submitted) * 100 : 0;
      const recoveryRate = submitted > 0 ? (paid / submitted) * 100 : 0;

      // Avg days to pay
      const paidClaims = insClaims.filter((c: any) => c.paid_at && c.submitted_at);
      const avgDaysToPay = paidClaims.length > 0
        ? paidClaims.reduce((s: number, c: any) => s + (new Date(c.paid_at).getTime() - new Date(c.submitted_at).getTime()) / (1000 * 60 * 60 * 24), 0) / paidClaims.length
        : 0;

      // Risk score: 0–100 (lower = riskier)
      const riskScore = Math.max(0, Math.min(100, 100 - denialRate * 1.5 - Math.max(0, avgDaysToPay - 30) * 0.5));

      return {
        name: ins.company_name,
        claims_count: insClaims.length,
        submitted, rejected, paid, outstanding,
        denialRate, recoveryRate, avgDaysToPay, riskScore,
      };
    }).filter((r: any) => r.claims_count > 0);
  }, [insurers, claims, payments]);

  const { sorted, sort, handleSort } = useSort(rows, "submitted");

  const totals = useMemo(() => ({
    submitted: rows.reduce((s, r) => s + r.submitted, 0),
    paid: rows.reduce((s, r) => s + r.paid, 0),
    outstanding: rows.reduce((s, r) => s + r.outstanding, 0),
  }), [rows]);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><Shield className="w-6 h-6" /> Insurer Profitability Scorecard</h1>
        <p className="page-description">Per-insurer revenue, denial rate, recovery rate, payment turnaround, and composite risk score.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-card"><p className="text-sm text-muted-foreground">Total Submitted</p><p className="text-2xl font-bold mt-1">GH¢ {totals.submitted.toLocaleString()}</p></div>
        <div className="stat-card"><p className="text-sm text-muted-foreground">Total Collected</p><p className="text-2xl font-bold mt-1 text-success">GH¢ {totals.paid.toLocaleString()}</p></div>
        <div className="stat-card"><p className="text-sm text-muted-foreground">Total Outstanding</p><p className="text-2xl font-bold mt-1 text-warning">GH¢ {totals.outstanding.toLocaleString()}</p></div>
      </div>

      <div className="stat-card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <SortableHeader label="Insurer" sortKey="name" currentSort={sort} onSort={handleSort} />
              <SortableHeader label="Claims" sortKey="claims_count" currentSort={sort} onSort={handleSort} />
              <SortableHeader label="Submitted" sortKey="submitted" currentSort={sort} onSort={handleSort} />
              <SortableHeader label="Paid" sortKey="paid" currentSort={sort} onSort={handleSort} />
              <SortableHeader label="Outstanding" sortKey="outstanding" currentSort={sort} onSort={handleSort} />
              <SortableHeader label="Denial %" sortKey="denialRate" currentSort={sort} onSort={handleSort} />
              <SortableHeader label="Recovery %" sortKey="recoveryRate" currentSort={sort} onSort={handleSort} />
              <SortableHeader label="Avg Days→Pay" sortKey="avgDaysToPay" currentSort={sort} onSort={handleSort} />
              <SortableHeader label="Risk Score" sortKey="riskScore" currentSort={sort} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r: any, i: number) => (
              <tr key={i}>
                <td className="font-medium">{r.name}</td>
                <td>{r.claims_count}</td>
                <td>{r.submitted.toLocaleString()}</td>
                <td className="text-success">{r.paid.toLocaleString()}</td>
                <td className="text-warning">{r.outstanding.toLocaleString()}</td>
                <td><span className={`badge ${r.denialRate < 10 ? "badge-success" : r.denialRate < 25 ? "badge-warning" : "badge-error"}`}>{r.denialRate.toFixed(1)}%</span></td>
                <td><span className={`badge ${r.recoveryRate >= 80 ? "badge-success" : r.recoveryRate >= 50 ? "badge-warning" : "badge-error"}`}>{r.recoveryRate.toFixed(1)}%</span></td>
                <td>{r.avgDaysToPay > 0 ? `${r.avgDaysToPay.toFixed(0)} days` : "—"}</td>
                <td className="font-semibold flex items-center gap-1">
                  {r.riskScore >= 70 ? <TrendingUp className="w-3 h-3 text-success" /> : <TrendingDown className="w-3 h-3 text-destructive" />}
                  {r.riskScore.toFixed(0)}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">No insurer activity yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}