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

  it("shows certified insurer-paid WHT as an AR credit and excludes provisional tax-control estimates", () => {
    const ledger = [
      { id: "claim", insurance_company_id: "ins-a", entry_date: "2026-01-02", entry_type: "claim_submission", account_debit: "Accounts Receivable", account_credit: "Claims Revenue", amount: 1000 },
      { id: "payment", insurance_company_id: "ins-a", entry_date: "2026-01-10", entry_type: "payment", account_debit: "Cash/Bank", account_credit: "Accounts Receivable", amount: 600 },
      { id: "estimate", insurance_company_id: "ins-a", entry_date: "2026-01-02", entry_type: "withholding_tax", account_debit: "WHT Expense", account_credit: "WHT Payable", amount: 50 },
      { id: "certificate", insurance_company_id: "ins-a", entry_date: "2026-01-20", entry_type: "withholding_tax_receipt", account_debit: "Withholding Tax Receivable", account_credit: "Accounts Receivable", amount: 50, reference: "WHT-CERT-GRA-001", description: "Insurer-paid WHT certificate" },
    ];
    const result = buildCompanyStatement(ledger, "ins-a", "2026-01-01", "2026-01-31");
    expect(result.totalDebit).toBe(1000);
    expect(result.totalCredit).toBe(650);
    expect(result.closingBalance).toBe(350);
    expect(result.lines.some((line) => line.entryType === "withholding_tax_receipt" && line.credit === 50)).toBe(true);
    expect(result.lines.some((line) => line.entryType === "withholding_tax")).toBe(false);
  });

  it("carries prior certified WHT credits into the opening balance", () => {
    const ledger = [
      { id: "prior-claim", insurance_company_id: "ins-a", entry_date: "2025-12-01", entry_type: "claim_submission", account_debit: "Accounts Receivable", account_credit: "Claims Revenue", amount: 500 },
      { id: "prior-certificate", insurance_company_id: "ins-a", entry_date: "2025-12-20", entry_type: "withholding_tax_receipt", account_debit: "Withholding Tax Receivable", account_credit: "Accounts Receivable", amount: 25 },
      { id: "current-claim", insurance_company_id: "ins-a", entry_date: "2026-01-02", entry_type: "claim_submission", account_debit: "Accounts Receivable", account_credit: "Claims Revenue", amount: 1000 },
      { id: "current-payment", insurance_company_id: "ins-a", entry_date: "2026-01-10", entry_type: "payment", account_debit: "Cash/Bank", account_credit: "Accounts Receivable", amount: 600 },
    ];
    const result = buildCompanyStatement(ledger, "ins-a", "2026-01-01", "2026-01-31");
    expect(result.openingBalance).toBe(475);
    expect(result.totalCredit).toBe(600);
    expect(result.closingBalance).toBe(875);
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
  const claims = [
    { claim_year: 2026, claim_month: 1, claim_amount: 125, status: "rejected" },
    { claim_year: 2026, claim_month: 2, claim_amount: 75, status: "rejected" },
    { claim_year: 2026, claim_month: 3, claim_amount: 20, status: "rejected" },
  ];
  const taxes = [
    { year: 2026, month: 1, tax_amount: 50, is_actual: false },
    { year: 2026, month: 1, tax_amount: 45, is_actual: true },
    { year: 2026, month: 2, tax_amount: 30, is_actual: false },
    { year: 2026, month: 3, tax_amount: 10, is_actual: false },
  ];
  const settlements = [
    { period_start: "2026-01-01", period_end: "2026-01-31", period_type: "month", rejection_amount: 130, provisional_withholding_tax: 50, actual_withholding_tax: 45, settlement_status: "payment_advice_received" },
  ];

  it("uses monthly settlement totals where present and actual WHT replaces provisional", () => {
    const result = buildStatementReconciliation(claims, taxes, settlements, "2026-01-15", "2026-02-10");
    expect(result.rejectedClaimsTotal).toBe(205);
    expect(result.provisionalWhtTotal).toBe(80);
    expect(result.actualWhtTotal).toBe(45);
    expect(result.effectiveWhtTotal).toBe(75);
    expect(result.monthlyBreakdown).toHaveLength(2);
    expect(result.monthlyBreakdown[0].rejected).toBe(130);
  });

  it("includes all months overlapping a partial date range and excludes outside months", () => {
    const result = buildStatementReconciliation(claims, taxes, settlements, "2026-02-28", "2026-03-01");
    expect(result.rejectedClaimsTotal).toBe(95);
    expect(result.monthlyBreakdown.map((row) => row.month)).toEqual([2, 3]);
  });

  it("uses settlement actual WHT as the statement credit only after advice is confirmed", () => {
    const confirmed = buildStatementWhtCredits(claims, taxes, settlements, "2026-01-31");
    expect(confirmed.find((row) => row.year === 2026 && row.month === 1)).toEqual({
      year: 2026, month: 1, amount: 45, basis: "actual",
    });
    const pending = [{ ...settlements[0], settlement_status: "awaiting_payment", actual_withholding_tax: 90 }];
    const result = buildStatementReconciliation(claims, taxes, pending, "2026-01-01", "2026-01-31");
    expect(result.actualWhtTotal).toBe(45);
    expect(result.effectiveWhtTotal).toBe(45);
  });

  it("rejects negative or non-finite tax and rejection totals", () => {
    const invalidTax = [{ year: 2026, month: 1, tax_amount: -1, is_actual: false }];
    expect(() => buildStatementReconciliation(claims, invalidTax, [], "2026-01-01", "2026-01-31")).toThrow(/invalid amount/i);
  });
});
