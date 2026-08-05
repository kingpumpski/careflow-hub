import { getAIProvider } from "../index";

export interface LedgerPoint { period: string; revenue: number; collected: number }

const SYSTEM = "You are a healthcare finance forecaster. Give numeric projections with stated assumptions. Currency: GH¢.";

/** Deterministic linear projection used as a baseline (and offline fallback). */
export function linearProjection(points: LedgerPoint[], periodsAhead = 3) {
  if (points.length < 2) return [];
  const ys = points.map((p) => p.revenue);
  const n = ys.length;
  const sumX = (n * (n - 1)) / 2;
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = ys.reduce((a, y, i) => a + i * y, 0);
  const sumXX = ys.reduce((a, _y, i) => a + i * i, 0);
  const slope = (n * sumXY - sumX * sumY) / Math.max(1, n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return Array.from({ length: periodsAhead }, (_v, k) => ({
    period: `+${k + 1}`,
    projected: Math.max(0, intercept + slope * (n + k)),
  }));
}

export async function forecastRevenue(points: LedgerPoint[]) {
  return getAIProvider().complete({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: "Forecast revenue for the next three months and flag downside risks." },
    ],
    context: { history: points, baseline: linearProjection(points) },
  });
}

export async function predictOutstanding(points: Array<{ period: string; outstanding: number }>) {
  return getAIProvider().complete({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: "Predict the outstanding balance trajectory and recommend collection actions." },
    ],
    context: { history: points },
  });
}

export async function predictSettlementTrend(points: Array<{ insurer: string; averageDays: number }>) {
  return getAIProvider().complete({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: "Assess settlement-period trends per insurer and rank the slowest payers." },
    ],
    context: { settlement: points },
  });
}