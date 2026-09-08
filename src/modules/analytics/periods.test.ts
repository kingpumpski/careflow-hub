import { describe, expect, it } from "vitest";
import { latestPeriodKeys, resolvePeriodKey } from "./periods";

describe("analytics period semantics", () => {
  it("prefers explicit claim year and month", () => {
    expect(resolvePeriodKey({ claim_year: 2026, claim_month: 4, submission_date: "2025-01-01" })).toBe("2026-04");
  });

  it("uses payment date when no explicit period exists", () => {
    expect(resolvePeriodKey({ payment_date: "2026-05-17" })).toBe("2026-05");
  });

  it("uses withholding-tax month and year", () => {
    expect(resolvePeriodKey({ month: 6, year: 2026, tax_amount: 500 })).toBe("2026-06");
  });

  it("does not invent a period for an undated row", () => {
    expect(resolvePeriodKey({ tax_amount: 500 })).toBeNull();
  });

  it("returns chronological latest real periods without mixing years", () => {
    const rows = [
      { claim_year: 2025, claim_month: 1 },
      { claim_year: 2025, claim_month: 12 },
      { claim_year: 2026, claim_month: 1 },
      { claim_year: 2026, claim_month: 2 },
    ];
    expect(latestPeriodKeys([rows], 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
});
