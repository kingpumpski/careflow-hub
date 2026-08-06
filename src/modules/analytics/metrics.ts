/**
 * Pure metric calculators shared by the executive dashboard, schedules, reports and AI services.
 * They accept raw database rows so any page can feed them straight from Supabase queries.
 */

export interface ExecutiveKpis {
  claimsCount: number;
  grossSubmitted: number;
  netSubmitted: number;
  rejectedAmount: number;
  paymentsReceived: number;
  withholdingTax: number;
  outstanding: number;
  rejectionRate: number;
  collectionRate: number;
  recoveryRate: number;
  avgSettlementDays: number;
  settledCount: number;
  complianceScore: number;
}

const sum = (rows: any[], key: string) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);

export function computeExecutiveKpis(
  claims: any[] = [],
  payments: any[] = [],
  withholdingTax: any[] = [],
): ExecutiveKpis {
  const rejected = claims.filter((c) => c.status === "rejected");
  const active = claims.filter((c) => c.status !== "rejected");

  const netSubmitted = sum(active, "claim_amount");
  const rejectedAmount = sum(rejected, "claim_amount");
  const grossSubmitted = netSubmitted + rejectedAmount;
  const paymentsReceived = sum(payments, "amount_paid");
  const tax = sum(withholdingTax, "tax_amount");

  const durations = claims
    .filter((c) => c.submitted_at && c.paid_at)
    .map((c) => (new Date(c.paid_at).getTime() - new Date(c.submitted_at).getTime()) / 86_400_000)
    .filter((d) => d >= 0);

  const rejectionRate = grossSubmitted > 0 ? (rejectedAmount / grossSubmitted) * 100 : 0;

  return {
    claimsCount: claims.length,
    grossSubmitted,
    netSubmitted,
    rejectedAmount,
    paymentsReceived,
    withholdingTax: tax,
    outstanding: netSubmitted - paymentsReceived - tax,
    rejectionRate,
    collectionRate: grossSubmitted > 0 ? (paymentsReceived / grossSubmitted) * 100 : 0,
    recoveryRate: netSubmitted > 0 ? (paymentsReceived / netSubmitted) * 100 : 0,
    avgSettlementDays: durations.length ? durations.reduce((s, d) => s + d, 0) / durations.length : 0,
    settledCount: durations.length,
    complianceScore: Math.max(0, Math.min(100, 100 - rejectionRate * 2)),
  };
}

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface TrendPoint {
  month: string;
  submitted: number;
  paid: number;
  rejected: number;
  outstanding: number;
}

/** Monthly trend series in GH¢ '000, with a cumulative outstanding balance line. */
export function buildTrendSeries(claims: any[] = [], payments: any[] = []): TrendPoint[] {
  let cumSubmitted = 0;
  let cumPaid = 0;
  return MONTH_LABELS.map((label, i) => {
    const monthClaims = claims.filter((c) => Number(c.claim_month) === i + 1);
    const submitted = sum(monthClaims.filter((c) => c.status !== "rejected"), "claim_amount");
    const rejected = sum(monthClaims.filter((c) => c.status === "rejected"), "claim_amount");
    const paid = sum(payments.filter((p) => Number(p.claim_month) === i + 1), "amount_paid");
    cumSubmitted += submitted;
    cumPaid += paid;
    return {
      month: label,
      submitted: submitted / 1000,
      paid: paid / 1000,
      rejected: rejected / 1000,
      outstanding: (cumSubmitted - cumPaid) / 1000,
    };
  });
}

export interface InsurerPerformance {
  id: string;
  name: string;
  shortName: string;
  color: string | null;
  claimsCount: number;
  submitted: number;
  rejected: number;
  paid: number;
  outstanding: number;
  rejectionRate: number;
  collectionRate: number;
}

/** Ranks insurers by exposure so the dashboard can surface concentration risk. */
export function rankInsurers(insurers: any[] = [], claims: any[] = [], payments: any[] = []): InsurerPerformance[] {
  return insurers
    .map((ins) => {
      const scoped = claims.filter((c) => c.insurance_company_id === ins.id);
      const submitted = sum(scoped.filter((c) => c.status !== "rejected"), "claim_amount");
      const rejected = sum(scoped.filter((c) => c.status === "rejected"), "claim_amount");
      const paid = sum(payments.filter((p) => p.insurance_company_id === ins.id), "amount_paid");
      const gross = submitted + rejected;
      const name = ins.company_name || "Unnamed";
      return {
        id: ins.id,
        name,
        shortName: name.length > 14 ? `${name.slice(0, 14)}…` : name,
        color: ins.color ?? null,
        claimsCount: scoped.length,
        submitted,
        rejected,
        paid,
        outstanding: submitted - paid,
        rejectionRate: gross > 0 ? (rejected / gross) * 100 : 0,
        collectionRate: submitted > 0 ? (paid / submitted) * 100 : 0,
      };
    })
    .sort((a, b) => b.submitted - a.submitted);
}

/** Straight-line projection of the next `periods` months from a numeric series. */
export function projectLinear(series: number[], periods = 3): number[] {
  if (series.length < 2) return Array(periods).fill(series[0] ?? 0);
  const n = series.length;
  const xMean = (n - 1) / 2;
  const yMean = series.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  series.forEach((y, x) => {
    num += (x - xMean) * (y - yMean);
    den += (x - xMean) ** 2;
  });
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  return Array.from({ length: periods }, (_, k) => Math.max(0, intercept + slope * (n + k)));
}
