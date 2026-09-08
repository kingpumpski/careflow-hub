import { describe, expect, it } from "vitest";
import { buildYearlyMetrics } from "@/modules/analytics/metrics";

describe("buildYearlyMetrics", () => {
  it("aggregates submitted, payments, computed tax and outstanding by year", () => {
    expect(buildYearlyMetrics(
      [
        { claim_year: 2025, claim_amount: 1000, status: "submitted" },
        { claim_year: 2025, claim_amount: 200, status: "rejected" },
        { claim_year: 2026, claim_amount: 500, status: "approved" },
      ],
      [
        { claim_year: 2025, amount_paid: 400 },
        { claim_year: 2026, amount_paid: 100 },
      ],
      [
        { year: 2025, tax_amount: 50 },
      ],
    )).toEqual([
      { year: 2026, submitted: 500, payments: 100, withholdingTax: 0, outstanding: 400 },
      { year: 2025, submitted: 1200, payments: 400, withholdingTax: 50, outstanding: 550 },
    ]);
  });
});