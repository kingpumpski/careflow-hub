import { useNavigate } from "react-router-dom";
import { FileCheck, Shield, CreditCard, AlertTriangle, Building2, TrendingUp, Percent, ShieldAlert, Ban, Timer, Wallet } from "lucide-react";
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

  // Executive KPIs
  const totalRejected = (claims || []).filter((c: any) => c.status === "rejected").reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
  const grandSubmitted = totalClaimsAmount + totalRejected;
  const lossRatio = grandSubmitted > 0 ? (totalRejected / grandSubmitted) * 100 : 0;
  const recoveryRate = totalClaimsAmount > 0 ? (totalPaid / totalClaimsAmount) * 100 : 0;
  const complianceScore = Math.max(0, Math.min(100, 100 - lossRatio * 2));

  // Collection rate & average settlement period
  const collectionRate = grandSubmitted > 0 ? (totalPaid / grandSubmitted) * 100 : 0;
  const settlementDurations = (claims || [])
    .filter((c: any) => c.submitted_at && c.paid_at)
    .map((c: any) => (new Date(c.paid_at).getTime() - new Date(c.submitted_at).getTime()) / 86400000)
    .filter((d: number) => d >= 0);
  const avgSettlementDays = settlementDurations.length
    ? settlementDurations.reduce((s: number, d: number) => s + d, 0) / settlementDurations.length
    : 0;

  // Trend series (cumulative outstanding)
  const trendData = (() => {
    let cumulativeSubmitted = 0, cumulativePaid = 0;
    return monthNames.map((m, i) => {
      const monthClaims = (claims || []).filter((c: any) => c.claim_month === i + 1);
      const submitted = monthClaims.filter((c: any) => c.status !== "rejected").reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
      const rejected = monthClaims.filter((c: any) => c.status === "rejected").reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
      const paid = (payments || []).filter((p: any) => Number(p.claim_month) === i + 1).reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0);
      cumulativeSubmitted += submitted;
      cumulativePaid += paid;
      return {
        month: m,
        submitted: submitted / 1000,
        paid: paid / 1000,
        rejected: rejected / 1000,
        outstanding: (cumulativeSubmitted - cumulativePaid) / 1000,
      };
    });
  })();

  // Insurance company comparison
  const insurerComparison = (insurers || []).map((ins: any) => {
    const insClaims = (claims || []).filter((c: any) => c.insurance_company_id === ins.id);
    return {
      name: (ins.company_name || "").length > 14 ? `${ins.company_name.slice(0, 14)}…` : ins.company_name,
      submitted: insClaims.filter((c: any) => c.status !== "rejected").reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0) / 1000,
      rejected: insClaims.filter((c: any) => c.status === "rejected").reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0) / 1000,
      paid: (payments || []).filter((p: any) => p.insurance_company_id === ins.id).reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0) / 1000,
    };
  }).sort((a: any, b: any) => b.submitted - a.submitted).slice(0, 8);

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
        <h1 className="page-title">Executive Command Center</h1>
        <p className="page-description">Real-time view of revenue, risk, and operational health.</p>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="cursor-pointer" onClick={() => navigate("/rejections")}>
          <StatCard title="Rejection Amount" value={`GH¢ ${(totalRejected / 1000).toFixed(0)}K`} change={`${(claims || []).filter((c: any) => c.status === "rejected").length} rejected claims`} changeType="negative" icon={Ban} iconColor="bg-destructive/10 text-destructive" />
        </div>
        <div className="cursor-pointer" onClick={() => navigate("/rejections")}>
          <StatCard title="Rejection Rate" value={`${lossRatio.toFixed(1)}%`} change="Rejected / Submitted" changeType={lossRatio < 10 ? "positive" : "negative"} icon={Percent} iconColor="bg-warning/10 text-warning" />
        </div>
        <div className="cursor-pointer" onClick={() => navigate("/payments")}>
          <StatCard title="Collection Rate" value={`${collectionRate.toFixed(1)}%`} change="Payments / Gross Submitted" changeType={collectionRate >= 70 ? "positive" : "negative"} icon={Wallet} iconColor="bg-success/10 text-success" />
        </div>
        <div className="cursor-pointer" onClick={() => navigate("/analytics")}>
          <StatCard title="Avg Settlement Period" value={`${avgSettlementDays.toFixed(0)} days`} change={settlementDurations.length ? `${settlementDurations.length} settled claims` : "No settled claims yet"} changeType={avgSettlementDays <= 60 ? "positive" : "negative"} icon={Timer} iconColor="bg-info/10 text-info" />
        </div>
        <div className="cursor-pointer" onClick={() => navigate("/analytics")}>
          <StatCard title="Recovery Rate" value={`${recoveryRate.toFixed(1)}%`} change="Paid / Net Submitted" changeType={recoveryRate >= 70 ? "positive" : "negative"} icon={TrendingUp} iconColor="bg-success/10 text-success" />
        </div>
        <div className="cursor-pointer" onClick={() => navigate("/fraud-alerts")}>
          <StatCard title="Compliance Score" value={`${complianceScore.toFixed(0)}/100`} change="Risk-adjusted" changeType={complianceScore >= 80 ? "positive" : "negative"} icon={ShieldAlert} iconColor="bg-primary/10 text-primary" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="stat-card">
          <h3 className="font-heading font-semibold mb-4">Submission, Payment &amp; Rejection Trend (GH¢ '000)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="submitted" stroke="hsl(var(--primary))" strokeWidth={2} name="Submitted" dot={false} />
              <Line type="monotone" dataKey="paid" stroke="hsl(var(--success))" strokeWidth={2} name="Payments" dot={false} />
              <Line type="monotone" dataKey="rejected" stroke="hsl(var(--destructive))" strokeWidth={2} name="Rejections" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="stat-card">
          <h3 className="font-heading font-semibold mb-4">Outstanding Balance Trend (GH¢ '000)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="outstanding" stroke="hsl(var(--warning))" strokeWidth={2} name="Outstanding" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-heading font-semibold mb-4">Insurance Company Comparison (GH¢ '000)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={insurerComparison.length ? insurerComparison : [{ name: "No Data", submitted: 0, paid: 0, rejected: 0 }]}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="submitted" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Submitted" />
            <Bar dataKey="paid" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} name="Payments" />
            <Bar dataKey="rejected" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} name="Rejections" />
          </BarChart>
        </ResponsiveContainer>
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
