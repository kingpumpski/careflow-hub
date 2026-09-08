import { useMemo } from "react";
import { BarChart3, CandlestickChart, GitBranch, Grid3X3, Target, TrendingUp } from "lucide-react";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import ChartCard from "@/components/dashboard/ChartCard";
import {
  ClaimsExposureCandlestick,
  ClaimsFunnel,
  ClaimsHeatmap,
  ClaimsPareto,
  ClaimsWaterfall,
} from "@/components/dashboard/AdvancedClaimsCharts";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const n = (v: unknown) => Number(v || 0);

function periodOf(row: any) {
  const year = n(row.claim_year ?? row.year) || new Date(row.submitted_at || row.payment_date || row.created_at || Date.now()).getFullYear();
  const month = n(row.claim_month ?? row.month) || new Date(row.submitted_at || row.payment_date || row.created_at || Date.now()).getMonth() + 1;
  return { year, month };
}

export default function AdvancedAnalytics() {
  const { data: claims } = useSupabaseQuery("claims");
  const { data: payments } = useSupabaseQuery("payments");
  const { data: wht } = useSupabaseQuery("withholding_tax");
  const { data: insurers } = useSupabaseQuery("insurance_companies");

  const periods = useMemo(() => {
    const keys = new Set<string>();
    [...(claims || []), ...(payments || []), ...(wht || [])].forEach((row: any) => {
      const p = periodOf(row);
      keys.add(`${p.year}-${String(p.month).padStart(2, "0")}`);
    });
    return [...keys].sort().slice(-12);
  }, [claims, payments, wht]);

  const exposure = useMemo(() => {
    let previous = 0;
    return periods.map((key) => {
      const [year, month] = key.split("-").map(Number);
      const scopedClaims = (claims || []).filter((c: any) => { const p = periodOf(c); return p.year === year && p.month === month; });
      const submitted = scopedClaims.reduce((s: number, c: any) => s + n(c.claim_amount), 0);
      const rejected = scopedClaims.filter((c: any) => c.status === "rejected").reduce((s: number, c: any) => s + n(c.claim_amount), 0);
      const paid = (payments || []).filter((p: any) => { const q = periodOf(p); return q.year === year && q.month === month; }).reduce((s: number, p: any) => s + n(p.amount_paid), 0);
      const tax = (wht || []).filter((t: any) => { const q = periodOf(t); return q.year === year && q.month === month; }).reduce((s: number, t: any) => s + n(t.tax_amount), 0);
      const open = Math.max(previous, 0);
      const high = open + Math.max(submitted - rejected, 0);
      const low = Math.max(0, open - paid - tax);
      const close = Math.max(0, high - paid - tax);
      previous = close;
      return { label: `${months[month - 1]} ${String(year).slice(-2)}`, open, high, low, close, submitted, paid, withholdingTax: tax };
    });
  }, [periods, claims, payments, wht]);

  const waterfall = useMemo(() => {
    const submitted = (claims || []).reduce((s: number, c: any) => s + n(c.claim_amount), 0);
    const rejected = (claims || []).filter((c: any) => c.status === "rejected").reduce((s: number, c: any) => s + n(c.claim_amount), 0);
    const paid = (payments || []).reduce((s: number, p: any) => s + n(p.amount_paid), 0);
    const tax = (wht || []).reduce((s: number, t: any) => s + n(t.tax_amount), 0);
    const net = Math.max(0, submitted - rejected);
    const outstanding = Math.max(0, net - paid - tax);
    return [
      { label: "Gross submitted", value: submitted, kind: "start" as const },
      { label: "Rejected", value: -rejected, kind: "negative" as const },
      { label: "Payments", value: -paid, kind: "negative" as const },
      { label: "WHT", value: -tax, kind: "negative" as const },
      { label: "Outstanding", value: outstanding, kind: "end" as const },
    ];
  }, [claims, payments, wht]);

  const pareto = useMemo(() => {
    const rows = (insurers || []).map((ins: any) => ({
      label: ins.company_name || "Unnamed",
      value: (claims || []).filter((c: any) => c.insurance_company_id === ins.id && c.status === "rejected").reduce((s: number, c: any) => s + n(c.claim_amount), 0),
    })).filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
    const total = rows.reduce((s, r) => s + r.value, 0);
    let running = 0;
    return rows.map((r) => { running += r.value; return { ...r, cumulative: total ? (running / total) * 100 : 0 }; });
  }, [insurers, claims]);

  const heatmap = useMemo(() => {
    const statuses = ["Submitted", "Paid", "Rejected"];
    return statuses.map((status) => ({
      label: status,
      values: months.map((_, i) => {
        if (status === "Submitted") return (claims || []).filter((c: any) => periodOf(c).month === i + 1 && c.status !== "rejected").length;
        if (status === "Rejected") return (claims || []).filter((c: any) => periodOf(c).month === i + 1 && c.status === "rejected").length;
        return (payments || []).filter((p: any) => periodOf(p).month === i + 1).length;
      }),
    }));
  }, [claims, payments]);

  const funnel = useMemo(() => {
    const submitted = (claims || []).length;
    const adjudicated = (claims || []).filter((c: any) => ["paid", "rejected"].includes(c.status)).length;
    const paid = (claims || []).filter((c: any) => c.status === "paid").length;
    return [
      { label: "Claims received", value: submitted },
      { label: "Adjudicated", value: adjudicated },
      { label: "Paid claims", value: paid },
    ];
  }, [claims]);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2"><BarChart3 className="w-6 h-6" /> Advanced Claims Analytics</h1>
          <p className="page-description">Institutional-grade visual analysis for exposure, settlement, concentration, operational activity and claim conversion.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="Claims exposure OHLC" subtitle="Candlestick-style opening, high, low and closing outstanding exposure by period">
          <ClaimsExposureCandlestick data={exposure} />
        </ChartCard>
        <ChartCard title="Financial reconciliation waterfall" subtitle="Gross submitted value reconciled through rejection, payment and withholding tax">
          <ClaimsWaterfall data={waterfall} />
        </ChartCard>
        <ChartCard title="Rejection concentration Pareto" subtitle="Ranked insurer rejection value and cumulative concentration">
          <ClaimsPareto data={pareto} />
        </ChartCard>
        <ChartCard title="Operational activity heatmap" subtitle="Monthly claim and payment activity intensity">
          <ClaimsHeatmap data={heatmap} />
        </ChartCard>
        <ChartCard title="Claims lifecycle funnel" subtitle="Received → adjudicated → paid conversion">
          <ClaimsFunnel data={funnel} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          [CandlestickChart, "OHLC exposure", "Financial-style exposure movement"],
          [GitBranch, "Waterfall reconciliation", "Trace every major value movement"],
          [Target, "Pareto concentration", "Prioritize the largest rejection sources"],
          [Grid3X3, "Activity heatmap", "Spot operational seasonality"],
          [TrendingUp, "Lifecycle funnel", "Monitor conversion through adjudication"],
        ].map(([Icon, title, description]: any) => (
          <div key={title} className="stat-card flex items-start gap-3">
            <Icon className="w-5 h-5 text-primary mt-0.5" />
            <div><p className="font-semibold text-sm">{title}</p><p className="text-xs text-muted-foreground mt-1">{description}</p></div>
          </div>
        ))}
      </div>
    </div>
  );
}
