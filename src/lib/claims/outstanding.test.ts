import { describe, expect, it } from "vitest";
import { calculateOutstanding, resolveAggregateStatus, resolveOutstandingStatus } from "./outstanding";

describe("claims outstanding calculation", () => {
  it("calculates actual settlement exposure", () => {
    expect(calculateOutstanding(100000, 10000, 60000, 5000)).toBe(25000);
  });

  it("keeps incomplete settlement provisional", () => {
    expect(calculateOutstanding(100000, 10000, 60000, 0)).toBe(30000);
    expect(resolveOutstandingStatus(1, 0)).toBe("provisional");
  });

  it("handles WHT without a cash payment", () => {
    expect(calculateOutstanding(100000, 10000, 0, 5000)).toBe(85000);
    expect(resolveOutstandingStatus(0, 1)).toBe("provisional");
  });

  it("treats an explicitly recorded zero WHT as reconciled", () => {
    expect(calculateOutstanding(100000, 10000, 90000, 0)).toBe(0);
    expect(resolveOutstandingStatus(1, 1)).toBe("actual");
  });

  it("floors over-settled balances at zero", () => {
    expect(calculateOutstanding(100000, 10000, 100000, 10000)).toBe(0);
  });

  it("requires every included period to be actual for an aggregate actual status", () => {
    expect(resolveAggregateStatus(["actual", "actual"])).toBe("actual");
    expect(resolveAggregateStatus(["actual", "provisional"])).toBe("provisional");
    expect(resolveAggregateStatus([])).toBe("provisional");
  });
});
