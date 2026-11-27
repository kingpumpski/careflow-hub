import { describe, expect, it } from "vitest";
import { summarizePaymentsByReceiptMonth } from "./receiptMonthSummary";

describe("summarizePaymentsByReceiptMonth", () => {
  it("groups payment cash by insurer and recorded payment month", () => {
    const result = summarizePaymentsByReceiptMonth([
      { insurance_company_id: "insurer-a", payment_date: "2026-10-03", amount_paid: "120.50" },
      { insurance_company_id: "insurer-a", payment_date: "2026-10-29", amount_paid: 80 },
      { insurance_company_id: "insurer-a", payment_date: "2026-11-02", amount_paid: 50 },
      { insurance_company_id: "insurer-b", payment_date: "2026-10-04", amount_paid: 25 },
    ]);

    expect(result).toEqual([
      { insurance_company_id: "insurer-a", receipt_month: "2026-11-01", receipt_year: 2026, receipt_month_number: 11, net_cash_received: 50, payment_count: 1 },
      { insurance_company_id: "insurer-a", receipt_month: "2026-10-01", receipt_year: 2026, receipt_month_number: 10, net_cash_received: 200.5, payment_count: 2 },
      { insurance_company_id: "insurer-b", receipt_month: "2026-10-01", receipt_year: 2026, receipt_month_number: 10, net_cash_received: 25, payment_count: 1 },
    ]);
  });

  it("ignores missing dates, invalid months, and non-finite amounts", () => {
    const result = summarizePaymentsByReceiptMonth([
      { insurance_company_id: "insurer-a", payment_date: null, amount_paid: 10 },
      { insurance_company_id: "insurer-a", payment_date: "2026-13-01", amount_paid: 10 },
      { insurance_company_id: "insurer-a", payment_date: "2026-12-01", amount_paid: "not-a-number" },
      { insurance_company_id: null, payment_date: "2026-12-01", amount_paid: 10 },
    ]);
    expect(result).toEqual([]);
  });
});
