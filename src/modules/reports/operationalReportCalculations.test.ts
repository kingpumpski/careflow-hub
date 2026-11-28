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
    settlementPeriods: [],
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

  it("keeps insurer outstanding unknown when the legacy view has a null balance", () => {
    const report = buildOperationalReportData({
      ...base,
      outstandingPeriods: [{
        insurance_company_id: "ins-a", period_year: 2026, period_month: 9,
        outstanding_amount: null, outstanding_status: null,
      }],
    });
    expect(report.insurerPerformance[0].outstanding).toBeNull();
    expect(report.outstandingFollowUp).toEqual([]);
  });

  it("calculates pending settlement delay and outstanding follow-up age without inventing actual receipt dates", () => {
    const report = buildOperationalReportData({
      ...base,
      settlementPeriods: [{ id: "s1", insurance_company_id: "ins-a", period_start: "2026-09-01", period_end: "2026-09-30", settlement_status: "awaiting_payment" }],
    });
    expect(report.settlementDelays[0]).toMatchObject({ daysPending: 59, daysToAdvice: null, daysToReceipt: null });
    expect(report.outstandingFollowUp).toEqual([]);
  });

  it("uses monthly aggregate settlement submissions when there are no individual claim rows", () => {
    const report = buildOperationalReportData({
      ...base,
      claims: [],
      payments: [],
      settlementPeriods: [{
        id: "cycle-aggregate", insurance_company_id: "ins-a",
        period_start: "2026-09-01", period_end: "2026-09-30",
        settlement_status: "reconciled", total_claims_submitted: 1000,
        rejection_amount: 100, payment_received: 877.5,
      }],
      outstandingPeriods: [{
        insurance_company_id: "ins-a", period_year: 2026, period_month: 9,
        outstanding_amount: 22.5, paid_amount: 877.5, outstanding_status: "actual",
      }],
    });
    expect(report.insurerPerformance[0]).toMatchObject({
      claimsCount: 0, periodCount: 1, submitted: 1000, rejected: 100,
      netClaim: 900, paid: 877.5, outstanding: null,
    });
  });

  it("does not treat missing aggregate rejection amounts as zero", () => {
    const report = buildOperationalReportData({
      ...base,
      claims: [],
      settlementPeriods: [{
        id: "cycle-no-rejection-advice", insurance_company_id: "ins-a",
        period_start: "2026-09-01", period_end: "2026-09-30",
        settlement_status: "reconciled", total_claims_submitted: 1000,
        rejection_amount: null, payment_received: 877.5,
      }],
      outstandingPeriods: [],
    });
    expect(report.insurerPerformance[0]).toMatchObject({
      submitted: 1000, rejected: null, netClaim: null, denialRate: null, recoveryRate: null,
    });
  });

  it("uses confirmed approved gross and actual WHT for cycle follow-up", () => {
    const report = buildOperationalReportData({
      ...base,
      claims: [],
      payments: [],
      settlementPeriods: [{
        id: "cycle-actual", insurance_company_id: "ins-a",
        period_start: "2026-09-01", period_end: "2026-09-30",
        settlement_status: "reconciled", total_claims_submitted: 1000,
        approved_gross_amount: 900, rejection_amount: 100,
        actual_withholding_tax: 22.5, payment_received: 877.5,
      }],
      outstandingPeriods: [],
    });
    expect(report.insurerPerformance[0]).toMatchObject({ submitted: 1000, rejected: 100, outstanding: 0 });
    expect(report.outstandingFollowUp).toEqual([]);
  });

  it("uses provisional WHT for pending-cycle exposure until actual advice exists", () => {
    const report = buildOperationalReportData({
      ...base,
      claims: [],
      payments: [],
      settlementPeriods: [{
        id: "cycle-pending", insurance_company_id: "ins-a",
        period_start: "2026-09-01", period_end: "2026-09-30",
        settlement_status: "awaiting_payment", total_claims_submitted: 1000,
        rejection_amount: 100, provisional_withholding_tax: 50,
      }],
      outstandingPeriods: [],
    });
    expect(report.insurerPerformance[0]).toMatchObject({ submitted: 1000, rejected: 100, outstanding: 850 });
    expect(report.outstandingFollowUp[0]).toMatchObject({ outstanding: 850, taxBasis: "Provisional WHT", ageBand: "31–60 days" });
  });

  it("counts claim audit events by staff without counting unrelated audit events", () => {
    const report = buildOperationalReportData(base);
    expect(report.staffActivity).toEqual([{ actorId: "staff-1", staffName: "Claims Officer", inserts: 1, updates: 1, distinctClaimsTouched: 1, lastActivity: "2026-09-02T00:00:00Z" }]);
  });
});
