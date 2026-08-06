import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield, CreditCard, AlertTriangle, Ban, Percent, Wallet, Timer, TrendingUp, Building2,
  FileCheck, Sparkles, Loader2,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import KPICard from "@/components/dashboard/KPICard";
import ChartCard from "@/components/dashboard/ChartCard";
import InsightCard, { AIInsightBadge } from "@/components/dashboard/InsightCard";
import { Button } from "@/components/ui/button";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { buildDashboardInsights, buildTrendSeries, computeExecutiveKpis, rankInsurers } from "@/modules/analytics";
import { managementRecommendations } from "@/modules/ai/services/insights";
import { useToast } from "@/hooks/use-toast";

const cedis = (v: number) => `GH¢ ${Math.round(v).toLocaleString()}`;
const thousands = (v: number) => `GH¢ ${(v / 1000).toFixed(0)}K`;

export default function Dashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: claims } = useSupabaseQuery("claims");
  const { data: preauths } = useSupabaseQuery("pre_authorizations");
  const { data: payments } = useSupabaseQuery("payments");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: withholdingTax } = useSupabaseQuery("withholding_tax");

  const [aiNarrative, setAiNarrative] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const kpis = useMemo(() => computeExecutiveKpis(claims || [], payments || [], withholdingTax || []), [claims, payments, withholdingTax]);
  const trend = useMemo(() => buildTrendSeries(claims || [], payments || []), [claims, payments]);
  const ranked = useMemo(() => rankInsurers(insurers || [], claims || [], payments || []), [insurers, claims, payments]);
  const insights = useMemo(
    () => buildDashboardInsights(claims || [], payments || [], insurers || [], withholdingTax || []),
    [claims, payments, insurers, withholdingTax],
  );

  const activeTrend = trend.filter((t) => t.submitted > 0 || t.paid > 0 || t.rejected > 0);
  const chartData = activeTrend.length ? activeTrend : trend.slice(0, 6);
  const comparison = ranked.slice(0, 8).map((r) => ({
    name: r.shortName,
    submitted: r.submitted / 1000,
    paid: r.paid / 1000,
    rejected: r.rejected / 1000,
  }));

  const statusData = [
    { name: "Submitted", value: (claims || []).filter((c: any) => c.status === "submitted").length, color: "hsl(var(--primary))" },
    { name: "Paid", value: (claims || []).filter((c: any) => c.status === "paid").length, color: "hsl(var(--success))" },
    { name: "Rejected", value: (claims || []).filter((c: any) => c.status === "rejected").length, color: "hsl(var(--destructive))" },
  ].filter((s) => s.value > 0);

  const generateNarrative = async () => {
    setAiLoading(true);
    try {
      const reply = await managementRecommendations({
        kpis,
        monthlyTrend: activeTrend,
        insurerRanking: ranked.slice(0, 6),
        deterministicInsights: insights,
      });
      setAiNarrative(reply);
    } catch (e: any) {
      toast({ title: "AI insight unavailable", description: e?.message ?? "Please try again shortly.", variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">CareFlow Hub</h1>
          <p className="page-description">Executive claims intelligence — revenue, risk and operational health in real time.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/schedule")}>Generate schedule</Button>
          <Button size="sm" onClick={() => navigate("/reports")}>Reports</Button>
        </div>
      </div>

      {/* Executive KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard title="Total Claims Submitted" value={thousands(kpis.grossSubmitted)} hint={`${kpis.claimsCount} claims recorded`} tone="primary" icon={Shield} onClick={() => navigate("/claims")} />
        <KPICard title="Total Payments Received" value={thousands(kpis.paymentsReceived)} hint={`${kpis.collectionRate.toFixed(1)}% collection rate`} trend="up" tone="success" icon={CreditCard} onClick={() => navigate("/payments")} />
        <KPICard title="Outstanding Balance" value={thousands(kpis.outstanding)} hint={`Net of ${cedis(kpis.withholdingTax)} withholding tax`} trend="down" tone="warning" icon={AlertTriangle} onClick={() => navigate("/outstanding")} />
        <KPICard title="Rejected Amount" value={thousands(kpis.rejectedAmount)} hint={`${(claims || []).filter((c: any) => c.status === "rejected").length} rejected claims`} trend="down" tone="destructive" icon={Ban} onClick={() => navigate("/rejections")} />
        <KPICard title="Rejection Rate" value={`${kpis.rejectionRate.toFixed(1)}%`} hint="Rejected / gross submitted" trend={kpis.rejectionRate < 10 ? "up" : "down"} tone={kpis.rejectionRate < 10 ? "accent" : "destructive"} icon={Percent} progress={kpis.rejectionRate} onClick={() => navigate("/rejections")} />
        <KPICard title="Collection Rate" value={`${kpis.collectionRate.toFixed(1)}%`} hint="Payments / gross submitted" trend={kpis.collectionRate >= 70 ? "up" : "down"} tone="success" icon={Wallet} progress={kpis.collectionRate} onClick={() => navigate("/payments")} />
        <KPICard title="Avg Settlement Period" value={`${kpis.avgSettlementDays.toFixed(0)} days`} hint={kpis.settledCount ? `${kpis.settledCount} settled claims` : "No settled claims yet"} trend={kpis.avgSettlementDays <= 60 ? "up" : "down"} tone="info" icon={Timer} onClick={() => navigate("/analytics")} />
        <KPICard title="Pre-Authorizations" value={String((preauths || []).length)} hint={`${(preauths || []).filter((p: any) => p.status === "pending").length} awaiting approval`} tone="accent" icon={FileCheck} onClick={() => navigate("/pre-auth")} />
      </div>

      {/* AI Insight Panel */}
      <ChartCard
        title="AI Insight Panel"
        subtitle="Claims intelligence, revenue forecast and settlement prediction"
        action={
          <div className="flex items-center gap-2">
            <AIInsightBadge />
            <Button size="sm" variant="outline" onClick={generateNarrative} disabled={aiLoading}>
              {aiLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
              {aiLoading ? "Analysing" : "Ask AI"}
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
        {aiNarrative && (
          <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-4">
            <p className="text-xs font-semibold text-primary mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> AI management recommendations
            </p>
            <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">{aiNarrative}</p>
          </div>
        )}
      </ChartCard>

      {/* Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Claims submission & payment collection trend" subtitle="GH¢ '000 per month">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="submitted" stroke="hsl(var(--primary))" strokeWidth={2.5} name="Submitted" dot={false} />
              <Line type="monotone" dataKey="paid" stroke="hsl(var(--success))" strokeWidth={2.5} name="Payments" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Outstanding balance trend" subtitle="Cumulative receivables, GH¢ '000">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="outstandingFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--warning))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--warning))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} />
              <Area type="monotone" dataKey="outstanding" stroke="hsl(var(--warning))" strokeWidth={2.5} fill="url(#outstandingFill)" name="Outstanding" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Rejection trend analysis" subtitle="Rejected value per month, GH¢ '000">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey="rejected" fill="hsl(var(--destructive))" radius={[6, 6, 0, 0]} name="Rejected" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Claim status distribution" subtitle="Volume by lifecycle status">
          {statusData.length ? (
            <>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                    {statusData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {statusData.map((s) => (
                  <div key={s.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-muted-foreground truncate">{s.name}</span>
                    <span className="font-semibold ml-auto">{s.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-center text-muted-foreground py-10 text-sm">No claims data yet</p>
          )}
        </ChartCard>
      </div>

      {/* Insurance company performance */}
      <ChartCard title="Insurance company performance" subtitle="Submitted, collected and rejected value — GH¢ '000">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={comparison.length ? comparison : [{ name: "No data", submitted: 0, paid: 0, rejected: 0 }]}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="submitted" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="Submitted" />
            <Bar dataKey="paid" fill="hsl(var(--success))" radius={[6, 6, 0, 0]} name="Payments" />
            <Bar dataKey="rejected" fill="hsl(var(--destructive))" radius={[6, 6, 0, 0]} name="Rejected" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Ranking table */}
      <ChartCard
        title="Insurance company performance ranking"
        subtitle="Ranked by exposure"
        action={<Button variant="ghost" size="sm" onClick={() => navigate("/insurer-scorecard")}>Full scorecard</Button>}
      >
        {ranked.length ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Insurer</th>
                  <th className="text-right">Claims</th>
                  <th className="text-right">Submitted</th>
                  <th className="text-right">Collected</th>
                  <th className="text-right">Outstanding</th>
                  <th className="text-right">Rejection %</th>
                </tr>
              </thead>
              <tbody>
                {ranked.slice(0, 8).map((r, i) => (
                  <tr key={r.id} className="hover:bg-muted/40 transition-colors">
                    <td className="text-muted-foreground font-semibold">{i + 1}</td>
                    <td>
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color || "hsl(var(--primary))" }} />
                        <span className="truncate font-medium">{r.name}</span>
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{r.claimsCount}</td>
                    <td className="text-right tabular-nums">{cedis(r.submitted)}</td>
                    <td className="text-right tabular-nums text-success">{cedis(r.paid)}</td>
                    <td className="text-right tabular-nums text-warning">{cedis(r.outstanding)}</td>
                    <td className={`text-right tabular-nums font-semibold ${r.rejectionRate > 10 ? "text-destructive" : "text-muted-foreground"}`}>
                      {r.rejectionRate.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-6 text-sm flex items-center justify-center gap-2">
            <Building2 className="w-4 h-4" /> No insurer data yet
          </p>
        )}
      </ChartCard>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <TrendingUp className="w-3.5 h-3.5" />
        Figures are aggregate claims intelligence only — patient-level data stays inside the pre-authorization module.
      </div>
    </div>
  );
}
