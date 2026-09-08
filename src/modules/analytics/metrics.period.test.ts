import { describe, expect, it } from "vitest";
import { buildTrendSeries } from "./metrics";

describe("buildTrendSeries", () => {
  it("keeps identical months from different years separate", () => {
    const series = buildTrendSeries(
      [
        { claim_amount: 1000, status: "submitted", claim_year: 2025, claim_month: 1 },
        { claim_amount: 2000, status: "submitted", claim_year: 2026, claim_month: 1 },
      ],
      [],
      [],
    );

    expect(series).toHaveLength(2);
    expect(series.map((point) => point.month)).toEqual(["Jan 25", "Jan 26"]);
    expect(series.map((point) => point.submitted)).toEqual([1, 2]);
  });

  it("returns the latest twelve real periods", () => {
    const claims = Array.from({ length: 14 }, (_, index) => ({
      claim_amount: 100,
      status: "submitted",
      claim_year: 2025 + Math.floor((index + 1) / 12),
      claim_month: ((index + 1) % 12) + 1,
    }));

    const series = buildTrendSeries(claims, [], []);

    expect(series).toHaveLength(12);
    expect(series[0].month).toBe("Apr 25");
    expect(series.at(-1)?.month).toBe("Mar 26");
  });
});
