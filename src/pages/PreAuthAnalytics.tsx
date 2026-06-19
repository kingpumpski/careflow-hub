import { useMemo } from "react";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16"];

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="stat-card">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold font-heading mt-1">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

export default function PreAuthAnalytics() {
  const { data: preauths, isLoading } = useSupabaseQuery("pre_authorizations");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: procedures } = useSupabaseQuery("procedures");
  const { data: doctors } = useSupabaseQuery("doctors");

  const stats = useMemo(() => {
    const list = preauths || [];
    const total = list.length;
    const approved = list.filter((p: any) => p.status === "approved").length;
    const rejected = list.filter((p: any) => p.status === "rejected").length;
    const completed = list.filter((p: any) => p.status === "completed").length;
    const requested = list.reduce((s: number, p: any) => s + Number(p.total_cost || 0), 0);
    const approvedAmt = list.filter((p: any) => ["approved", "completed"].includes(p.status))
      .reduce((s: number, p: any) => s + Number(p.total_cost || 0), 0);
    const avg = total ? requested / total : 0;

    // by insurer
    const insurerMap: Record<string, { name: string; count: number; cost: number; approved: number }> = {};
    list.forEach((p: any) => {
      const ins = (insurers || []).find((i: any) => i.id === p.insurance_company_id);
      const k = ins?.id || "unknown";
      if (!insurerMap[k]) insurerMap[k] = { name: ins?.company_name || "Unassigned", count: 0, cost: 0, approved: 0 };
      insurerMap[k].count++;
      insurerMap[k].cost += Number(p.total_cost || 0);
      if (["approved", "completed"].includes(p.status)) insurerMap[k].approved++;
    });
    const byInsurer = Object.values(insurerMap)
      .map(v => ({ ...v, approvalRate: v.count ? (v.approved / v.count) * 100 : 0 }))
      .sort((a, b) => b.count - a.count);

    // by procedure
    const procMap: Record<string, { name: string; count: number; cost: number }> = {};
    list.forEach((p: any) => {
      const proc = (procedures || []).find((pr: any) => pr.id === p.procedure_id);
      const k = proc?.id || "unknown";
      if (!procMap[k]) procMap[k] = { name: proc?.procedure_name || "Other", count: 0, cost: 0 };
      procMap[k].count++;
      procMap[k].cost += Number(p.total_cost || 0);
    });
    const byProcedure = Object.values(procMap).sort((a, b) => b.count - a.count);

    // by doctor
    const docMap: Record<string, { name: string; count: number; approved: number }> = {};
    list.forEach((p: any) => {
      const d = (doctors || []).find((dr: any) => dr.id === p.doctor_id);
      const k = d?.id || "unknown";
      if (!docMap[k]) docMap[k] = { name: d?.doctor_name || "Unassigned", count: 0, approved: 0 };
      docMap[k].count++;
      if (["approved", "completed"].includes(p.status)) docMap[k].approved++;
    });
    const byDoctor = Object.values(docMap)
      .map(v => ({ ...v, approvalRate: v.count ? (v.approved / v.count) * 100 : 0 }))
      .sort((a, b) => b.count - a.count);

    // turnaround
    const turnaroundDays = list
      .filter((p: any) => p.created_at && p.approved_at)
      .map((p: any) => (new Date(p.approved_at).getTime() - new Date(p.created_at).getTime()) / 86400000);
    const avgTurnaround = turnaroundDays.length ? turnaroundDays.reduce((a, b) => a + b, 0) / turnaroundDays.length : 0;

    return { total, approved, rejected, completed, requested, approvedAmt, avg, byInsurer, byProcedure, byDoctor, avgTurnaround };
  }, [preauths, insurers, procedures, doctors]);

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  const statusPie = [
    { name: "Approved", value: stats.approved },
    { name: "Rejected", value: stats.rejected },
    { name: "Completed", value: stats.completed },
    { name: "Pending/Draft", value: stats.total - stats.approved - stats.rejected - stats.completed },
  ].filter(x => x.value > 0);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Pre-Authorization Analytics</h1>
        <p className="page-description">Volume, financial, insurer, procedure, doctor and turnaround insights</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Requests" value={stats.total} />
        <StatCard label="Approved" value={stats.approved} hint={`${stats.total ? ((stats.approved / stats.total) * 100).toFixed(1) : 0}%`} />
        <StatCard label="Rejected" value={stats.rejected} hint={`${stats.total ? ((stats.rejected / stats.total) * 100).toFixed(1) : 0}%`} />
        <StatCard label="Completed" value={stats.completed} />
        <StatCard label="Total Requested" value={`GH¢ ${stats.requested.toLocaleString()}`} />
        <StatCard label="Total Approved" value={`GH¢ ${stats.approvedAmt.toLocaleString()}`} />
        <StatCard label="Avg Request Cost" value={`GH¢ ${stats.avg.toFixed(0)}`} />
        <StatCard label="Avg Turnaround (days)" value={stats.avgTurnaround.toFixed(1)} hint="Created → Approved" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="stat-card">
          <h3 className="font-heading font-semibold mb-3">Status Distribution</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={statusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                {statusPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="stat-card">
          <h3 className="font-heading font-semibold mb-3">Top Insurers by Volume</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats.byInsurer.slice(0, 6)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" name="Requests" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-heading font-semibold mb-3">Insurance Performance</h3>
        <table className="data-table">
          <thead><tr><th>Insurer</th><th>Requests</th><th>Total Cost</th><th>Approved</th><th>Approval %</th></tr></thead>
          <tbody>
            {stats.byInsurer.map((i, idx) => (
              <tr key={idx}>
                <td className="font-medium">{i.name}</td>
                <td>{i.count}</td>
                <td>GH¢ {i.cost.toLocaleString()}</td>
                <td>{i.approved}</td>
                <td>{i.approvalRate.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="stat-card">
          <h3 className="font-heading font-semibold mb-3">Top Procedures</h3>
          <table className="data-table">
            <thead><tr><th>Procedure</th><th>Count</th><th>Total Cost</th></tr></thead>
            <tbody>
              {stats.byProcedure.slice(0, 10).map((p, i) => (
                <tr key={i}><td>{p.name}</td><td>{p.count}</td><td>GH¢ {p.cost.toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="stat-card">
          <h3 className="font-heading font-semibold mb-3">Requests by Doctor</h3>
          <table className="data-table">
            <thead><tr><th>Doctor</th><th>Requests</th><th>Approval %</th></tr></thead>
            <tbody>
              {stats.byDoctor.slice(0, 10).map((d, i) => (
                <tr key={i}><td>{d.name}</td><td>{d.count}</td><td>{d.approvalRate.toFixed(1)}%</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}