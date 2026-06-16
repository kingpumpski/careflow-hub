import { useMemo } from "react";
import { Stethoscope, TrendingUp } from "lucide-react";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import SortableHeader, { useSort } from "@/components/shared/SortableHeader";

export default function ProviderPerformance() {
  const { data: preauths } = useSupabaseQuery("pre_authorizations");
  const { data: doctors } = useSupabaseQuery("doctors");
  const { sortKey, sortDir, toggleSort, sortData } = useSort("revenue", "desc");

  const rows = useMemo(() => {
    return (doctors || []).map((d: any) => {
      const docPreauths = (preauths || []).filter((p: any) => p.doctor_id === d.id);
      const total = docPreauths.length;
      const approved = docPreauths.filter((p: any) => p.status === "approved").length;
      const rejected = docPreauths.filter((p: any) => p.status === "rejected").length;
      const revenue = docPreauths
        .filter((p: any) => p.status === "approved")
        .reduce((s: number, p: any) => s + Number(p.total_cost || 0), 0);
      const avgCost = total > 0 ? docPreauths.reduce((s: number, p: any) => s + Number(p.total_cost || 0), 0) / total : 0;
      const approvalRate = total > 0 ? (approved / total) * 100 : 0;
      return {
        doctor_name: d.doctor_name,
        specialty: d.specialty || "—",
        hospital: d.hospital || "—",
        total, approved, rejected, revenue, avgCost, approvalRate,
      };
    }).filter((r: any) => r.total > 0);
  }, [doctors, preauths]);

  const sorted = sortData(rows);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><Stethoscope className="w-6 h-6" /> Provider Performance</h1>
        <p className="page-description">Doctor-level volume, approval rate, and revenue ranking from pre-authorization data.</p>
      </div>

      <div className="stat-card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <SortableHeader label="Doctor" sortKey="doctor_name" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Specialty" sortKey="specialty" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Volume" sortKey="total" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Approved" sortKey="approved" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Rejected" sortKey="rejected" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Approval %" sortKey="approvalRate" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Avg Cost (GH¢)" sortKey="avgCost" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Revenue (GH¢)" sortKey="revenue" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r: any, i: number) => (
              <tr key={i}>
                <td className="font-medium">{r.doctor_name}</td>
                <td>{r.specialty}</td>
                <td>{r.total}</td>
                <td className="text-success">{r.approved}</td>
                <td className="text-destructive">{r.rejected}</td>
                <td>
                  <span className={`badge ${r.approvalRate >= 80 ? "badge-success" : r.approvalRate >= 50 ? "badge-warning" : "badge-error"}`}>
                    {r.approvalRate.toFixed(1)}%
                  </span>
                </td>
                <td>{r.avgCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td className="font-semibold flex items-center gap-1"><TrendingUp className="w-3 h-3 text-success" />{r.revenue.toLocaleString()}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No provider activity yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}