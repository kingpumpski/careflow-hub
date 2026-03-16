import { useNavigate } from "react-router-dom";
import { FileCheck, Shield, CreditCard, AlertTriangle, Building2 } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: claims } = useSupabaseQuery("claims");
  const { data: preauths } = useSupabaseQuery("pre_authorizations");
  const { data: payments } = useSupabaseQuery("payments");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: withholdingTax } = useSupabaseQuery("withholding_tax");

  const totalClaimsAmount = (claims || []).filter((c: any) => c.status !== "rejected").reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
  const totalPaid = (payments || []).reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0);
  const totalTax = (withholdingTax || []).reduce((s: number, t: any) => s + Number(t.tax_amount || 0), 0);
  const outstanding = totalClaimsAmount - totalPaid - totalTax;

  // Claims by month for chart
  const monthlyData = monthNames.map((m, i) => {
    const monthClaims = (claims || []).filter((c: any) => c.claim_month === i + 1);
    const submitted = monthClaims.filter((c: any) => c.status !== "rejected").reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
    const rejected = monthClaims.filter((c: any) => c.status === "rejected").reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
    const monthPayments = (payments || []).filter((p: any) => {
      const d = new Date(p.payment_date);
      return d.getMonth() === i;
    }).reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0);
    return { month: m, submitted: submitted / 1000, paid: monthPayments / 1000, rejected: rejected / 1000 };
  }).filter(d => d.submitted > 0 || d.paid > 0);

  // Status distribution
  const statusCounts = {
    submitted: (claims || []).filter((c: any) => c.status === "submitted").length,
    paid: (claims || []).filter((c: any) => c.status === "paid").length,
    rejected: (claims || []).filter((c: any) => c.status === "rejected").length,
  };
  const statusData = [
    { name: "Submitted", value: statusCounts.submitted, color: "hsl(210, 78%, 42%)" },
    { name: "Paid", value: statusCounts.paid, color: "hsl(152, 60%, 42%)" },
    { name: "Rejected", value: statusCounts.rejected, color: "hsl(0, 72%, 51%)" },
  ].filter(s => s.value > 0);

  // Top insurers
  const topInsurers = (insurers || []).map((ins: any) => {
    const insClaims = (claims || []).filter((c: any) => c.insurance_company_id === ins.id && c.status !== "rejected");
    const total = insClaims.reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
    return { ...ins, total, claimCount: insClaims.length };
  }).sort((a: any, b: any) => b.total - a.total).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-description">Overview of your claims and insurance operations</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="cursor-pointer" onClick={() => navigate("/claims")}>
          <StatCard title="Total Claims" value={`GH¢ ${(totalClaimsAmount / 1000).toFixed(0)}K`} change={`${(claims || []).length} claims`} changeType="positive" icon={Shield} />
        </div>
        <div className="cursor-pointer" onClick={() => navigate("/pre-auth")}>
          <StatCard title="Pre-Authorizations" value={String((preauths || []).length)} change={`${(preauths || []).filter((p: any) => p.status === "pending").length} pending`} changeType="positive" icon={FileCheck} iconColor="bg-accent/10 text-accent" />
        </div>
        <div className="cursor-pointer" onClick={() => navigate("/payments")}>
          <StatCard title="Total Payments" value={`GH¢ ${(totalPaid / 1000).toFixed(0)}K`} change="Received" changeType="positive" icon={CreditCard} iconColor="bg-success/10 text-success" />
        </div>
        <div className="cursor-pointer" onClick={() => navigate("/outstanding")}>
          <StatCard title="Outstanding" value={`GH¢ ${(outstanding / 1000).toFixed(0)}K`} change="Balance due" changeType="negative" icon={AlertTriangle} iconColor="bg-warning/10 text-warning" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 stat-card">
          <h3 className="font-heading font-semibold mb-4">Claims Overview (GH¢ '000)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyData.length > 0 ? monthlyData : [{ month: "No Data", submitted: 0, paid: 0, rejected: 0 }]}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="submitted" fill="hsl(210, 78%, 42%)" radius={[4, 4, 0, 0]} name="Submitted" />
              <Bar dataKey="paid" fill="hsl(168, 72%, 40%)" radius={[4, 4, 0, 0]} name="Paid" />
              <Bar dataKey="rejected" fill="hsl(0, 72%, 51%)" radius={[4, 4, 0, 0]} name="Rejected" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="stat-card">
          <h3 className="font-heading font-semibold mb-4">Claim Status</h3>
          {statusData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                    {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {statusData.map((s) => (
                  <div key={s.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-muted-foreground">{s.name}</span>
                    <span className="font-semibold ml-auto">{s.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-center text-muted-foreground py-8">No claims data yet</p>
          )}
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-heading font-semibold mb-4 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          Top Insurance Partners
        </h3>
        {topInsurers.length > 0 ? (
          <div className="space-y-3">
            {topInsurers.map((ins: any, i: number) => (
              <div key={ins.id} className="flex items-center gap-3">
                <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: ins.color || "#3b82f6" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{ins.company_name}</p>
                  <p className="text-xs text-muted-foreground">{ins.claimCount} claims</p>
                </div>
                <span className="text-sm font-semibold">GH¢ {ins.total.toLocaleString()}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-4">No claims data yet</p>
        )}
      </div>
    </div>
  );
}
