import { computeExecutiveKpis, buildTrendSeries, rankInsurers, projectLinear } from "./metrics";

export interface DashboardInsight {
  id: string;
  tone: "positive" | "warning" | "critical" | "neutral";
  title: string;
  body: string;
}

/**
 * Deterministic insight layer. Runs entirely on aggregate figures so the panel is
 * always populated; the AI services in `src/modules/ai` enrich the same inputs.
 */
export function buildDashboardInsights(claims: any[] = [], payments: any[] = [], insurers: any[] = [], withholdingTax: any[] = []): DashboardInsight[] {
  const kpis = computeExecutiveKpis(claims, payments, withholdingTax);
  const trend = buildTrendSeries(claims, payments);
  const ranked = rankInsurers(insurers, claims, payments);
  const money = (v: number) => `GH¢ ${Math.round(v).toLocaleString()}`;
  const insights: DashboardInsight[] = [];

  const active = trend.filter((t) => t.submitted > 0 || t.paid > 0);
  const quarter = (arr: typeof trend, from: number, to: number) => arr.slice(from, to).reduce((s, t) => s + t.submitted - t.paid, 0);
  const thisQ = quarter(trend, 9, 12);
  const lastQ = quarter(trend, 6, 9);
  if (lastQ !== 0) {
    const delta = ((thisQ - lastQ) / Math.abs(lastQ)) * 100;
    insights.push({
      id: "outstanding-trend",
      tone: delta > 0 ? "warning" : "positive",
      title: "Outstanding movement",
      body: `Outstanding balances ${delta > 0 ? "increased" : "decreased"} by ${Math.abs(delta).toFixed(1)}% compared with the previous quarter.`,
    });
  }

  const top = ranked[0];
  const totalReceivables = ranked.reduce((s, r) => s + Math.max(0, r.outstanding), 0);
  if (top && totalReceivables > 0) {
    const share = (Math.max(0, top.outstanding) / totalReceivables) * 100;
    insights.push({
      id: "concentration",
      tone: share > 40 ? "warning" : "neutral",
      title: "Receivables concentration",
      body: `${top.name} contributes ${share.toFixed(0)}% of total receivables (${money(Math.max(0, top.outstanding))}).`,
    });
  }

  insights.push({
    id: "rejection",
    tone: kpis.rejectionRate > 10 ? "critical" : kpis.rejectionRate > 5 ? "warning" : "positive",
    title: "Rejection exposure",
    body: `Rejection rate stands at ${kpis.rejectionRate.toFixed(1)}% (${money(kpis.rejectedAmount)}). ${kpis.rejectionRate > 5 ? "Prioritise denial root-cause review and appeals." : "Denials are within a healthy band."}`,
  });

  const forecast = projectLinear(active.map((t) => t.paid * 1000), 3);
  if (forecast.some((v) => v > 0)) {
    insights.push({
      id: "forecast",
      tone: "neutral",
      title: "Revenue forecast (next 3 months)",
      body: `Projected collections of ${money(forecast.reduce((s, v) => s + v, 0))}, averaging ${money(forecast.reduce((s, v) => s + v, 0) / 3)} per month at the current settlement pace.`,
    });
  }

  insights.push({
    id: "settlement",
    tone: kpis.avgSettlementDays > 60 ? "warning" : "positive",
    title: "Settlement prediction",
    body: kpis.settledCount
      ? `Average settlement period is ${kpis.avgSettlementDays.toFixed(0)} days across ${kpis.settledCount} settled claims. Expect current submissions to clear around ${kpis.avgSettlementDays.toFixed(0)} days from submission.`
      : "No settled claims yet — settlement prediction becomes available once payments are matched to submitted claims.",
  });

  return insights;
}
