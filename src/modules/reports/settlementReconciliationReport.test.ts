import { describe, expect, it } from "vitest";
import { buildSettlementReconciliationRows, summarizeSettlementReconciliationRows } from "./settlementReconciliationReport";

describe("settlement reconciliation report", () => {
  it("matches advice values to the original claims cycle and keeps provisional and actual WHT separate", () => {
    const rows = buildSettlementReconciliationRows([{
      id: "cycle-1", insurance_company_id: "insurer-a",
      period_start: "2026-09-01", period_end: "2026-09-30",
      total_claims_submitted: "1000", approved_gross_amount: "900",
      provisional_withholding_tax: "50", rejection_amount: "100",
      actual_withholding_tax: "22.50", payment_received: "877.50",
      settlement_status: "reconciled", payment_advice_reference: "ADV-SEP",
      payment_advice_date: "2026-10-10", actual_receipt_date: "2026-10-14",
    }]);
    expect(rows[0]).toMatchObject({
      periodStart: "2026-09-01", submitted: 1000, approvedGross: 900,
      rejected: 100, provisionalWht: 50, actualWht: 22.5,
      cashReceived: 877.5, approvalVariance: 0,
      approvedUnpaid: 0, adviceReference: "ADV-SEP", receiptDate: "2026-10-14",
    });
    const summary = summarizeSettlementReconciliationRows(rows);
    expect(summary).toMatchObject({ periodCount: 1, submitted: 1000, approvedGross: 900, provisionalWht: 50, actualWht: 22.5, cashReceived: 877.5, balancedCount: 1 });
  });

  it("does not infer approved gross or unpaid balance for legacy advice without an approved amount", () => {
    const rows = buildSettlementReconciliationRows([{
      id: "cycle-2", insurance_company_id: "insurer-a",
      period_start: "2026-08-01", period_end: "2026-08-31",
      total_claims_submitted: 500, provisional_withholding_tax: 25,
      rejection_amount: 50, actual_withholding_tax: 11.25,
      payment_received: 438.75, settlement_status: "reconciled",
    }]);
    expect(rows[0].approvedGross).toBeNull();
    expect(rows[0].approvalVariance).toBeNull();
    expect(rows[0].approvedUnpaid).toBeNull();
  });

  it("preserves awaiting cycles as unconfirmed and does not infer actual WHT", () => {
    const rows = buildSettlementReconciliationRows([{
      id: "cycle-3", insurance_company_id: "insurer-b",
      period_start: "2026-11-01", period_end: "2026-11-30",
      total_claims_submitted: 1200, provisional_withholding_tax: 60,
      settlement_status: "awaiting_payment",
    }]);
    expect(rows[0]).toMatchObject({ submitted: 1200, provisionalWht: 60, approvedGross: null, actualWht: null, cashReceived: null, approvedUnpaid: null });
  });
});
