import { describe, expect, it } from "vitest";
import { buildCompanyStatement, buildStatementReconciliation } from "./statementOfAccount";

const rows = [
  { id: "1", insurance_company_id: "ins-a", entry_date: "2026-01-02", entry_type: "claim_submission", account_debit: "Accounts Receivable", account_credit: "Claims Revenue", amount: 1000, description: "January claims", reference: "CLM-001" },
  { id: "2", insurance_company_id: "ins-a", entry_date: "2026-01-05", entry_type: "payment", account_debit: "Cash/Bank", account_credit: "Accounts Receivable", amount: 600, description: "Payment received", reference: "PAY-001" },
  { id: "3", insurance_company_id: "ins-a", entry_date: "2026-01-06", entry_type: "withholding_tax", account_debit: "WHT Expense", account_credit: "WHT Payable", amount: 50, description: "Provisional WHT", reference: "WHT-001" },
  { id: "4", insurance_company_id: "ins-a", entry_date: "2026-02-01", entry_type: "claim_submission", account_debit: "Accounts Receivable", account_credit: "Claims Revenue", amount: 300, description: "February claims", reference: "CLM-002" },
  { id: "5", insurance_company_id: "ins-b", entry_date: "2026-01-03", entry_type: "claim_submission", account_debit: "Accounts Receivable", account_credit: "Claims Revenue", amount: 900, description: "Other insurer", reference: "CLM-003" },
];

describe("company statement of account", () => {
  it("calculates opening balance, period totals and a running debit balance", () => {
    const result = buildCompanyStatement(rows, "ins-a", "2026-01-05", "2026-01-31");
    expect(result.openingBalance).toBe(1000);
    expect(result.totalDebit).toBe(0);
    expect(result.totalCredit).toBe(600);
    expect(result.closingBalance).toBe(400);
    expect(result.closingSide).toBe("debit");
    expect(result.lines[0].balance).toBe(400);
  });

  it("excludes other companies and non-receivable tax-control postings", () => {
    const result = buildCompanyStatement(rows, "ins-a", "2026-01-01", "2026-01-31");
    expect(result.lines).toHaveLength(2);
    expect(result.totalDebit).toBe(1000);
    expect(result.totalCredit).toBe(600);
    expect(result.closingBalance).toBe(400);
  });

  it("reports a credit balance when receipts exceed the opening and period debits", () => {
    const result = buildCompanyStatement(rows, "ins-a", "2026-01-01", "2026-01-05");
    expect(result.closingBalance).toBe(400);
    const credit = buildCompanyStatement([
      { id: "a", insurance_company_id: "ins-a", entry_date: "2026-01-01", entry_type: "payment", account_debit: "Cash/Bank", account_credit: "Accounts Receivable", amount: 250 },
    ], "ins-a", "2026-01-01", "2026-01-31");
    expect(credit.closingBalance).toBe(-250);
    expect(credit.closingSide).toBe("credit");
  });

  it("rejects invalid date ranges and ambiguous postings", () => {
    expect(() => buildCompanyStatement(rows, "ins-a", "2026-02-01", "2026-01-01")).toThrow();
    expect(() => buildCompanyStatement([
      { id: "x", insurance_company_id: "ins-a", entry_date: "2026-01-01", entry_type: "x", account_debit: "Accounts Receivable", account_credit: "Accounts Receivable", amount: 10 },
    ], "ins-a", "2026-01-01", "2026-01-31")).toThrow();
  });
});

describe("company statement claims and tax reconciliation", () => {
  const periods = [
    { period_year: 2026, period_month: 1, rejected_amount: 125, provisional_withholding_tax_amount: 50, actual_withholding_tax_amount: 45, withholding_tax_amount: 45 },
    { period_year: 2026, period_month: 2, rejected_amount: 75, provisional_withholding_tax_amount: 30, actual_withholding_tax_amount: 0, withholding_tax_amount: 30 },
    { period_year: 2026, period_month: 3, rejected_amount: 20, provisional_withholding_tax_amount: 10, actual_withholding_tax_amount: 0, withholding_tax_amount: 10 },
  ];

  it("totals rejected claims and reports provisional, actual and effective WHT without double counting", () => {
    const result = buildStatementReconciliation(periods, "2026-01-15", "2026-02-10");
    expect(result.rejectedClaimsTotal).toBe(200);
    expect(result.provisionalWhtTotal).toBe(80);
    expect(result.actualWhtTotal).toBe(45);
    expect(result.effectiveWhtTotal).toBe(75);
    expect(result.monthlyBreakdown).toHaveLength(2);
  });

  it("includes months that overlap a partial date range and excludes months outside it", () => {
    const result = buildStatementReconciliation(periods, "2026-02-28", "2026-03-01");
    expect(result.rejectedClaimsTotal).toBe(95);
    expect(result.monthlyBreakdown.map((row) => row.month)).toEqual([2, 3]);
  });

  it("rejects negative or non-finite tax and rejection totals", () => {
    expect(() => buildStatementReconciliation([
      { ...periods[0], rejected_amount: -1 },
    ], "2026-01-01", "2026-01-31")).toThrow(/invalid amount/i);
  });
});
