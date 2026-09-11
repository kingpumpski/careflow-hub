import { useMemo, useState } from "react";
import { BarChart3, RotateCcw } from "lucide-react";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { usePermissions } from "@/modules/security/usePermissions";
import ChartCard from "@/components/dashboard/ChartCard";
import {
  ClaimsExposureCandlestick,
  ClaimsFunnel,
  ClaimsHeatmap,
  ClaimsPareto,
  ClaimsWaterfall,
  SettlementControlChart,
  SettlementBoxPlot,
  InsurerPerformanceRadar,
} from "@/components/dashboard/AdvancedClaimsCharts";
import { resolvePeriodKey } from "@/modules/analytics/periods";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const n = (v: unknown) => Number(v || 0);
const money = (v: number) => `GH¢ ${Math.round(v).toLocaleString()}`;
type PeriodRow = { period_year: number; period_month: number; insurance_company_id?: string; submitted_amount: number; rejected_amount: number; paid_amount: number; withholding_tax_amount: number; outstanding_amount: number; outstanding_status: "actual" | "provisional"; };
function ageBand(year: number, month: number) {
  const end = new Date(year, month, 0);
  const days = Math.max(0, Math.floor((Date.now() - end.getTime()) / 86400000));
  return days <= 30 ? "0–30" : days <= 60 ? "31–60" : days <= 90 ? "61–90" : days <= 120 ? "91–120" : "120+";
}
function quantiles(values: number[]) {
  const a = [...values].sort((x, y) => x - y);
  if (!a.length) return null;
  const q = (p: number) => { const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
  return { min: a[0], q1: q(.25), median: q(.5), q3: q(.75), max: a[a.length - 1], count: a.length };
}

export default function AdvancedAnalytics() {
  const { can, loading: permissionsLoading } = usePermissions();
  const canReadAnalytics = can("analytics.read");
  const analyticsEnabled = !permissionsLoading && canReadAnalytics;

  const { data: claims } = useSupabaseQuery("claims", { enabled: analyticsEnabled });
  const { data: insurers } = useSupabaseQuery("insurance_companies", { enabled: analyticsEnabled });
  const { data: outstanding } = useSupabaseQuery("claims_outstanding_periods", { enabled: analyticsEnabled });

  const [insurerId, setInsurerId] = useState("all");
  const [status, setStatus] = useState("all");
  const [settlement, setSettlement] = useState("all");
  const [aging, setAging] = useState("all");
  const [startPeriod, setStartPeriod] = useState("");
  const [endPeriod, setEndPeriod] = useState("");

  const rows = (outstanding || []) as unknown as PeriodRow[];
  const allPeriods = useMemo(() => [...new Set(rows.map(r => `${r.period_year}-${String(r.period_month).padStart(2, "0")}`))].sort(), [rows]);
  const defaultStart = allPeriods.length > 12 ? allPeriods[allPeriods.length - 12] : allPeriods[0] || "";
  const defaultEnd = allPeriods.at(-1) || "";
  const effectiveStart = startPeriod || defaultStart;
  const effectiveEnd = endPeriod || defaultEnd;
  const inRange = (key: string) => (!effectiveStart || key >= effectiveStart) && (!effectiveEnd || key <= effectiveEnd);

  const filteredFinancial = useMemo(() => rows.filter(r => {
    const key = `${r.period_year}-${String(r.period_month).padStart(2, "0")}`;
    return inRange(key)
      && (insurerId === "all" || r.insurance_company_id === insurerId)
      && (settlement === "all" || r.outstanding_status === settlement)
      && (aging === "all" || ageBand(r.period_year, r.period_month) === aging);
  }), [rows, effectiveStart, effectiveEnd, insurerId, settlement, aging]);

  const filteredClaims = useMemo(() => (claims || []).filter((c: any) => {
    const key = resolvePeriodKey(c);
    return Boolean(key && inRange(key))
      && (insurerId === "all" || c.insurance_company_id === insurerId)
      && (status === "all" || String(c.status || "").toLowerCase() === status);
  }), [claims, effectiveStart, effectiveEnd, insurerId, status]);

  const financialPeriods = useMemo(() => [...new Set(filteredFinancial.map(r => `${r.period_year}-${String(r.period_month).padStart(2, "0")}`))].sort(), [filteredFinancial]);
  const exposure = useMemo(() => {
    let previous = 0;
    return financialPeriods.map(key => {
      const [year, month] = key.split("-").map(Number);
      const rs = filteredFinancial.filter(r => r.period_year === year && r.period_month === month);
      const submitted = rs.reduce((s, r) => s + n(r.submitted_amount), 0);
      const rejected = rs.reduce((s, r) => s + n(r.rejected_amount), 0);
      const paid = rs.reduce((s, r) => s + n(r.paid_amount), 0);
      const tax = rs.reduce((s, r) => s + n(r.withholding_tax_amount), 0);
      const close = rs.reduce((s, r) => s + n(r.outstanding_amount), 0);
      const open = previous;
      previous = close;
      return { label: `${months[month - 1]} ${String(year).slice(-2)}`, open, high: Math.max(open, open + submitted - rejected), low: Math.min(open, close), close, submitted, paid, withholdingTax: tax };
    });
  }, [financialPeriods, filteredFinancial]);

  const waterfall = useMemo(() => {
    const submitted = filteredFinancial.reduce((s, r) => s + n(r.submitted_amount), 0);
    const rejected = filteredFinancial.reduce((s, r) => s + n(r.rejected_amount), 0);
    const paid = filteredFinancial.reduce((s, r) => s + n(r.paid_amount), 0);
    const tax = filteredFinancial.reduce((s, r) => s + n(r.withholding_tax_amount), 0);
    const outstandingTotal = filteredFinancial.reduce((s, r) => s + n(r.outstanding_amount), 0);
    return [
      { label: "Gross submitted", value: submitted, kind: "start" as const },
      { label: "Rejected", value: -rejected, kind: "negative" as const },
      { label: "Payments", value: -paid, kind: "negative" as const },
      { label: "WHT", value: -tax, kind: "negative" as const },
      { label: "Outstanding", value: outstandingTotal, kind: "end" as const },
    ];
  }, [filteredFinancial]);

  const pareto = useMemo(() => {
    const rowsByInsurer = (insurers || []).map((i: any) => ({
      label: i.company_name || "Unnamed",
      value: filteredFinancial.filter(r => r.insurance_company_id === i.id).reduce((s, r) => s + n(r.rejected_amount), 0),
    })).filter(r => r.value > 0).sort((a, b) => b.value - a.value);
    const total = rowsByInsurer.reduce((s, r) => s + r.value, 0);
    let run = 0;
    return rowsByInsurer.map(r => { run += r.value; return { ...r, cumulative: total ? run / total * 100 : 0 }; });
  }, [insurers, filteredFinancial]);

  const heatmap = useMemo(() => financialPeriods.length ? ["Submitted", "Paid", "Rejected"].map(label => ({
    label,
    values: financialPeriods.map(key => {
      const [year, month] = key.split("-").map(Number);
      const rs = filteredFinancial.filter(r => r.period_year === year && r.period_month === month);
      return label === "Submitted" ? rs.reduce((s, r) => s + n(r.submitted_amount), 0) : label === "Paid" ? rs.reduce((s, r) => s + n(r.paid_amount), 0) : rs.reduce((s, r) => s + n(r.rejected_amount), 0);
    }),
  })) : [], [financialPeriods, filteredFinancial]);

  const funnel = useMemo(() => {
    const total = filteredClaims.length;
    const adjudicated = filteredClaims.filter((c: any) => ["paid", "rejected"].includes(String(c.status || "").toLowerCase())).length;
    const paid = filteredClaims.filter((c: any) => String(c.status || "").toLowerCase() === "paid").length;
    return [{ label: "Claims received", value: total }, { label: "Adjudicated", value: adjudicated }, { label: "Paid claims", value: paid }];
  }, [filteredClaims]);

  const control = useMemo(() => filteredClaims.filter((c: any) => c.submitted_at && c.paid_at).map((c: any) => ({ label: String(c.claim_reference || c.id || "").slice(0, 8), value: Math.max(0, (new Date(c.paid_at).getTime() - new Date(c.submitted_at).getTime()) / 86400000) })).slice(-24), [filteredClaims]);
  const box = useMemo(() => {
    const by: Record<string, number[]> = {};
    filteredClaims.filter((c: any) => c.submitted_at && c.paid_at).forEach((c: any) => { const key = resolvePeriodKey(c); if (!key) return; by[key] ??= []; by[key].push(Math.max(0, (new Date(c.paid_at).getTime() - new Date(c.submitted_at).getTime()) / 86400000)); });
    return Object.entries(by).sort().slice(-8).map(([label, values]) => ({ ...quantiles(values)!, label }));
  }, [filteredClaims]);

  const radar = useMemo(() => (insurers || []).map((i: any) => {
    const rs = filteredFinancial.filter(r => r.insurance_company_id === i.id);
    const submitted = rs.reduce((s, r) => s + n(r.submitted_amount), 0);
    const rejected = rs.reduce((s, r) => s + n(r.rejected_amount), 0);
    const paid = rs.reduce((s, r) => s + n(r.paid_amount), 0);
    return { label: i.company_name || "Unnamed", denial: submitted ? Math.max(0, 100 - rejected / submitted * 100) : 0, collection: submitted ? Math.min(100, paid / submitted * 100) : 0, speed: 100, volume: submitted };
  }).filter(r => r.volume > 0).sort((a, b) => b.volume - a.volume).map((r, _, all) => ({ ...r, volume: Math.min(100, r.volume / Math.max(...all.map(x => x.volume)) * 100) })), [insurers, filteredFinancial]);

  const summary = useMemo(() => ({
    total: filteredFinancial.reduce((s, r) => s + n(r.outstanding_amount), 0),
    actual: filteredFinancial.filter(r => r.outstanding_status === "actual").length,
    provisional: filteredFinancial.filter(r => r.outstanding_status === "provisional").length,
  }), [filteredFinancial]);
  const activeCount = [insurerId !== "all", status !== "all", settlement !== "all", aging !== "all", Boolean(startPeriod), Boolean(endPeriod)].filter(Boolean).length;
  const reset = () => { setInsurerId("all"); setStatus("all"); setSettlement("all"); setAging("all"); setStartPeriod(""); setEndPeriod(""); };

  if (permissionsLoading) {
    return <div className="stat-card flex min-h-[240px] items-center justify-center text-muted-foreground">Checking analytics access…</div>;
  }

  if (!canReadAnalytics) {
    return (
      <div className="stat-card flex min-h-[240px] flex-col items-center justify-center gap-2 px-6 text-center">
        <BarChart3 className="h-8 w-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Advanced analytics access restricted</h1>
        <p className="max-w-md text-sm text-muted-foreground">Your account does not have the analytics.read permission. No advanced analytics data is requested until access is granted.</p>
      </div>
    );
  }

  return <div className="space-y-6">
    <div className="page-header"><div><h1 className="page-title flex items-center gap-2"><BarChart3 className="w-6 h-6" />Advanced Claims Analytics</h1><p className="page-description">Executive BI workspace with period-authoritative settlement exposure, concentration, process control and insurer benchmarking.</p></div></div>
    <section className="rounded-xl border bg-card p-4 space-y-4" aria-label="Analytics filters">
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Analysis controls</h2><p className="text-xs text-muted-foreground">Financial charts use the system-calculated outstanding ledger. Operational charts use claims lifecycle data.</p></div><button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted"><RotateCcw className="w-3.5 h-3.5" />Reset{activeCount ? ` (${activeCount})` : ""}</button></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <label className="text-xs space-y-1"><span className="text-muted-foreground">From period</span><select value={startPeriod} onChange={e => setStartPeriod(e.target.value)} className="w-full rounded-md border bg-background px-2 py-2"><option value="">Latest 12 / earliest</option>{allPeriods.map(k => <option key={k} value={k}>{k}</option>)}</select></label>
        <label className="text-xs space-y-1"><span className="text-muted-foreground">To period</span><select value={endPeriod} onChange={e => setEndPeriod(e.target.value)} className="w-full rounded-md border bg-background px-2 py-2"><option value="">Latest</option>{allPeriods.map(k => <option key={k} value={k}>{k}</option>)}</select></label>
        <label className="text-xs space-y-1"><span className="text-muted-foreground">Insurer</span><select value={insurerId} onChange={e => setInsurerId(e.target.value)} className="w-full rounded-md border bg-background px-2 py-2"><option value="all">All insurers</option>{(insurers || []).map((i: any) => <option key={i.id} value={i.id}>{i.company_name}</option>)}</select></label>
        <label className="text-xs space-y-1"><span className="text-muted-foreground">Claim status</span><select value={status} onChange={e => setStatus(e.target.value)} className="w-full rounded-md border bg-background px-2 py-2"><option value="all">All statuses</option>{[...new Set((claims || []).map((c: any) => String(c.status || "").toLowerCase()).filter(Boolean))].sort().map((s: string) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select></label>
        <label className="text-xs space-y-1"><span className="text-muted-foreground">Settlement state</span><select value={settlement} onChange={e => setSettlement(e.target.value)} className="w-full rounded-md border bg-background px-2 py-2"><option value="all">Actual + provisional</option><option value="actual">Actual</option><option value="provisional">Provisional</option></select></label>
        <label className="text-xs space-y-1"><span className="text-muted-foreground">Aging band</span><select value={aging} onChange={e => setAging(e.target.value)} className="w-full rounded-md border bg-background px-2 py-2"><option value="all">All aging</option>{["0–30", "31–60", "61–90", "91–120", "120+"].map(s => <option key={s} value={s}>{s} days</option>)}</select></label>
      </div>
    </section>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-4"><div className="stat-card"><p className="text-xs text-muted-foreground">System-calculated outstanding</p><p className="text-2xl font-bold">{money(summary.total)}</p></div><div className="stat-card"><p className="text-xs text-muted-foreground">Actual periods</p><p className="text-2xl font-bold">{summary.actual}</p></div><div className="stat-card"><p className="text-xs text-muted-foreground">Provisional periods</p><p className="text-2xl font-bold">{summary.provisional}</p></div></div>

    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <ChartCard title="Claims Exposure OHLC" subtitle="Period-end outstanding exposure derived from the calculated ledger"><ClaimsExposureCandlestick data={exposure} /></ChartCard>
      <ChartCard title="Settlement Reconciliation Waterfall" subtitle="Gross submitted less rejected claims, cash payments and withholding tax"><ClaimsWaterfall data={waterfall} /></ChartCard>
      <ChartCard title="Rejection Concentration Pareto" subtitle="Insurer concentration of rejected claim exposure"><ClaimsPareto data={pareto} /></ChartCard>
      <ChartCard title="Financial Activity Heatmap" subtitle="Actual period keys; years are never collapsed into a month-of-year bucket"><ClaimsHeatmap data={heatmap} /></ChartCard>
      <ChartCard title="Claims Lifecycle Funnel" subtitle="Operational lifecycle counts under the selected period, insurer and claim-status filters"><ClaimsFunnel data={funnel} /></ChartCard>
      <ChartCard title="Settlement Process Control" subtitle="Claim-level settlement duration for statistical process monitoring"><SettlementControlChart data={control} /></ChartCard>
      <ChartCard title="Settlement Distribution" subtitle="Period-level settlement duration quartiles"><SettlementBoxPlot data={box} /></ChartCard>
      <ChartCard title="Insurer Performance Radar" subtitle="Collection, denial avoidance and relative submitted exposure"><InsurerPerformanceRadar data={radar} /></ChartCard>
    </div>
    <p className="text-xs text-muted-foreground">Financial formula: Outstanding = Submitted − Rejected − Payments Received − Withholding Tax, floored at zero. A period is actual only when both payment and withholding-tax entries are recorded; otherwise it remains provisional.</p>
  </div>;
}