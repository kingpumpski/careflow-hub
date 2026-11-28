export type OperationalClaim = {
  id: string;
  insurance_company_id: string;
  claim_amount: number | string | null;
  status?: string | null;
  denial_category?: string | null;
  denial_reason?: string | null;
  root_cause?: string | null;
  submitted_at?: string | null;
  submission_date?: string | null;
  paid_at?: string | null;
};
export type OperationalInsurer = { id: string; company_name: string };
export type OperationalPayment = { claim_id?: string | null; insurance_company_id?: string | null; amount_paid: number | string | null };
export type OperationalSettlementPeriod = {
  id: string; insurance_company_id: string; period_start: string; period_end: string;
  settlement_status: string; payment_advice_date?: string | null; actual_receipt_date?: string | null;
  total_claims_submitted?: number | string | null;
  rejection_amount?: number | string | null;
  payment_received?: number | string | null;
};
export type OperationalOutstandingPeriod = {
  insurance_company_id: string; period_year: number; period_month: number;
  outstanding_amount: number | string | null;
  paid_amount?: number | string | null;
  withholding_tax_amount?: number | string | null;
  outstanding_status?: string | null;
};
export type OperationalAuditLog = {
  table_name: string; action: string; record_id: string | null; changed_by: string | null; changed_at: string;
};
export type OperationalProfile = { id: string; full_name?: string | null };

const number = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const dateMs = (value: string | null | undefined) => {
  if (!value) return null;
  const ms = Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isFinite(ms) ? ms : null;
};
const daysBetween = (from: string | null | undefined, to: string | null | undefined) => {
  const start = dateMs(from), end = dateMs(to);
  if (start === null || end === null || end < start) return null;
  return Math.floor((end - start) / 86_400_000);
};
const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;
const ageBand = (days: number) => days <= 30 ? "0–30 days" : days <= 60 ? "31–60 days" : days <= 90 ? "61–90 days" : days <= 120 ? "91–120 days" : "120+ days";

export function buildOperationalReportData(input: {
  claims: readonly OperationalClaim[];
  insurers: readonly OperationalInsurer[];
  payments: readonly OperationalPayment[];
  settlementPeriods: readonly OperationalSettlementPeriod[];
  outstandingPeriods: readonly OperationalOutstandingPeriod[];
  auditLogs: readonly OperationalAuditLog[];
  profiles: readonly OperationalProfile[];
  today?: string;
}) {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const insurerNames = new Map(input.insurers.map((insurer) => [insurer.id, insurer.company_name]));

  const rejectionGroups = new Map<string, { category: string; reason: string; count: number; amount: number }>();
  for (const claim of input.claims) {
    if (String(claim.status ?? "").toLowerCase() !== "rejected") continue;
    const category = claim.denial_category?.trim() || "Uncategorised";
    const reason = claim.denial_reason?.trim() || "Reason not recorded";
    const key = `${category.toLowerCase()}::${reason.toLowerCase()}`;
    const current = rejectionGroups.get(key) ?? { category, reason, count: 0, amount: 0 };
    current.count += 1;
    current.amount += number(claim.claim_amount);
    rejectionGroups.set(key, current);
  }
  const rejectionReasons = [...rejectionGroups.values()].sort((a, b) => b.amount - a.amount);

  const insurerPerformance = input.insurers.map((insurer) => {
    const claims = input.claims.filter((claim) => claim.insurance_company_id === insurer.id);
    const claimIds = new Set(claims.map((claim) => claim.id));
    const linkedPayments = input.payments.filter((payment) => payment.claim_id && claimIds.has(payment.claim_id));
    const cycleRows = input.settlementPeriods.filter((period) => period.insurance_company_id === insurer.id);
    const hasAggregateSubmission = cycleRows.some((period) => period.total_claims_submitted != null);
    const submitted = hasAggregateSubmission
      ? cycleRows.reduce((sum, period) => sum + number(period.total_claims_submitted), 0)
      : claims.reduce((sum, claim) => sum + number(claim.claim_amount), 0);
    const rejected = hasAggregateSubmission
      ? cycleRows.reduce((sum, period) => sum + number(period.rejection_amount), 0)
      : claims.filter((claim) => String(claim.status ?? "").toLowerCase() === "rejected")
        .reduce((sum, claim) => sum + number(claim.claim_amount), 0);
    const netClaim = submitted - rejected;
    const financialRows = input.outstandingPeriods.filter((period) => period.insurance_company_id === insurer.id);
    const viewPaid = financialRows.some((period) => period.paid_amount != null)
      ? financialRows.reduce((sum, period) => sum + number(period.paid_amount), 0)
      : null;
    const cyclePaid = cycleRows.some((period) => period.payment_received != null)
      ? cycleRows.reduce((sum, period) => sum + number(period.payment_received), 0)
      : null;
    const paid = viewPaid ?? cyclePaid ?? linkedPayments.reduce((sum, payment) => sum + number(payment.amount_paid), 0);
    const outstanding = financialRows.length
      ? financialRows.reduce((sum, period) => sum + number(period.outstanding_amount), 0)
      : null;
    const durations = claims.map((claim) => daysBetween(claim.submitted_at || claim.submission_date, claim.paid_at))
      .filter((days): days is number => days !== null);
    return {
      insurerId: insurer.id, insurer: insurer.company_name, claimsCount: claims.length,
      submitted, rejected, netClaim, paid, outstanding,
      denialRate: submitted > 0 ? rejected / submitted * 100 : null,
      recoveryRate: netClaim > 0 ? paid / netClaim * 100 : null,
      averageDaysToPay: durations.length ? durations.reduce((sum, days) => sum + days, 0) / durations.length : null,
      paidClaimCount: durations.length, linkedPaymentCount: linkedPayments.length,
    };
  }).filter((row) => row.claimsCount > 0).sort((a, b) => b.submitted - a.submitted);

  const settlementDelays = input.settlementPeriods.map((period) => {
    const daysPending = period.settlement_status === "awaiting_payment"
      ? daysBetween(period.period_end, today)
      : null;
    return {
      id: period.id,
      insurer: insurerNames.get(period.insurance_company_id) || "Unknown insurer",
      claimsMonth: monthKey(Number(period.period_start.slice(0, 4)), Number(period.period_start.slice(5, 7))),
      status: period.settlement_status,
      daysPending,
      daysToAdvice: daysBetween(period.period_end, period.payment_advice_date),
      daysToReceipt: daysBetween(period.period_end, period.actual_receipt_date),
      adviceDate: period.payment_advice_date ?? null,
      receiptDate: period.actual_receipt_date ?? null,
    };
  }).sort((a, b) => (b.daysPending ?? -1) - (a.daysPending ?? -1));

  const outstandingFollowUp = input.outstandingPeriods.map((period) => {
    const outstanding = number(period.outstanding_amount);
    const daysOutstanding = daysBetween(
      new Date(Date.UTC(period.period_year, period.period_month, 0)).toISOString().slice(0, 10),
      today,
    ) ?? 0;
    return {
      insurer: insurerNames.get(period.insurance_company_id) || "Unknown insurer",
      claimsMonth: monthKey(period.period_year, period.period_month),
      outstanding,
      daysOutstanding,
      ageBand: ageBand(daysOutstanding),
      taxBasis: period.outstanding_status === "actual" ? "Actual WHT" : period.outstanding_status === "provisional" ? "Provisional WHT" : "Unknown WHT basis",
    };
  }).filter((row) => row.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding);

  const profileNames = new Map(input.profiles.map((profile) => [profile.id, profile.full_name?.trim() || "Staff account"]));
  const staffActivityGroups = new Map<string, { actorId: string; staffName: string; inserts: number; updates: number; records: Set<string>; lastActivity: string }>();
  for (const log of input.auditLogs) {
    if (log.table_name !== "claims" || !["insert", "update"].includes(log.action)) continue;
    const actorId = log.changed_by || "system";
    const current = staffActivityGroups.get(actorId) ?? {
      actorId, staffName: actorId === "system" ? "System / unknown" : profileNames.get(actorId) || "Staff account",
      inserts: 0, updates: 0, records: new Set<string>(), lastActivity: log.changed_at,
    };
    if (log.action === "insert") current.inserts += 1;
    if (log.action === "update") current.updates += 1;
    if (log.record_id) current.records.add(log.record_id);
    if (log.changed_at > current.lastActivity) current.lastActivity = log.changed_at;
    staffActivityGroups.set(actorId, current);
  }
  const staffActivity = [...staffActivityGroups.values()].map((row) => ({
    actorId: row.actorId,
    staffName: row.staffName,
    inserts: row.inserts,
    updates: row.updates,
    distinctClaimsTouched: row.records.size,
    lastActivity: row.lastActivity,
  })).sort((a, b) => (b.inserts + b.updates) - (a.inserts + a.updates));

  return { rejectionReasons, insurerPerformance, settlementDelays, outstandingFollowUp, staffActivity };
}
