import { describe, expect, it } from "vitest";
import { buildOperationalReportData } from "./operationalReportCalculations";

describe("operational report calculations", () => {
  const base = {
    insurers: [{ id: "ins-a", company_name: "Insurer A" }],
    claims: [
      { id: "c1", insurance_company_id: "ins-a", claim_amount: 1000, status: "rejected", denial_category: "coding_error", denial_reason: "Wrong code", submission_date: "2026-09-01", submitted_at: "2026-09-01T00:00:00Z" },
      { id: "c2", insurance_company_id: "ins-a", claim_amount: 900, status: "paid", submission_date: "2026-09-02", submitted_at: "2026-09-02T00:00:00Z", paid_at: "2026-09-12T00:00:00Z" },
    ],
    payments: [{ claim_id: "c2", insurance_company_id: "ins-a", amount_paid: 877.5 }],
    settlementPeriods: [{ id: "s1", insurance_company_id: "ins-a", period_start: "2026-09-01", period_end: "2026-09-30", settlement_status: "awaiting_payment" }],
    outstandingPeriods: [{ insurance_company_id: "ins-a", period_year: 2026, period_month: 9, outstanding_amount: 22.5, outstanding_status: "actual" }],
    auditLogs: [
      { table_name: "claims", action: "insert", record_id: "c1", changed_by: "staff-1", changed_at: "2026-09-01T00:00:00Z" },
      { table_name: "claims", action: "update", record_id: "c1", changed_by: "staff-1", changed_at: "2026-09-02T00:00:00Z" },
      { table_name: "payments", action: "insert", record_id: "p1", changed_by: "staff-2", changed_at: "2026-09-02T00:00:00Z" },
    ],
    profiles: [{ id: "staff-1", full_name: "Claims Officer" }],
    today: "2026-11-28",
  };

  it("groups rejection reasons and preserves gross submitted and rejected amounts", () => {
    const report = buildOperationalReportData(base);
    expect(report.rejectionReasons).toEqual([{ category: "coding_error", reason: "Wrong code", count: 1, amount: 1000 }]);
  });

  it("calculates insurer performance from claims and payments linked to those claims", () => {
    const report = buildOperationalReportData(base);
    expect(report.insurerPerformance[0]).toMatchObject({
      submitted: 1900, rejected: 1000, netClaim: 900, paid: 877.5,
      outstanding: 22.5, denialRate: 1000 / 1900 * 100,
      recoveryRate: 97.5, averageDaysToPay: 10, linkedPaymentCount: 1,
    });
  });

  it("calculates pending settlement delay and outstanding follow-up age without inventing actual receipt dates", () => {
    const report = buildOperationalReportData(base);
    expect(report.settlementDelays[0]).toMatchObject({ daysPending: 59, daysToAdvice: null, daysToReceipt: null });
    expect(report.outstandingFollowUp[0]).toMatchObject({ outstanding: 22.5, daysOutstanding: 59, ageBand: "31–60 days", taxBasis: "Actual WHT" });
  });

  it("counts claim audit events by staff without counting unrelated audit events", () => {
    const report = buildOperationalReportData(base);
    expect(report.staffActivity).toEqual([{ actorId: "staff-1", staffName: "Claims Officer", inserts: 1, updates: 1, distinctClaimsTouched: 1, lastActivity: "2026-09-02T00:00:00Z" }]);
  });
});
