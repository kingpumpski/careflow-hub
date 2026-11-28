import { describe, expect, it } from "vitest";
import { calculateOutstanding, resolveAggregateStatus, resolveOutstandingStatus } from "./outstanding";

describe("canonical outstanding calculation", () => {
  it("subtracts rejected claims exactly once", () => {
    expect(calculateOutstanding(100000, 10000, 60000, 5000)).toBe(25000);
  });

  it("treats cash and withholding tax as separate settlement components", () => {
    expect(calculateOutstanding(100000, 0, 95000, 5000)).toBe(0);
  });

  it("never returns a negative balance", () => {
    expect(calculateOutstanding(100000, 0, 120000, 0)).toBe(0);
  });

  it("requires payment advice and certificate coverage when WHT is due", () => {
    expect(resolveOutstandingStatus(1, 0)).toBe("provisional");
    expect(resolveOutstandingStatus(0, 1)).toBe("provisional");
    expect(resolveOutstandingStatus(1, 0, 0, 0)).toBe("actual");
    expect(resolveOutstandingStatus(1, 1, 5000, 5000)).toBe("actual");
    expect(resolveOutstandingStatus(1, 1, 5000, 1200)).toBe("partial");
    expect(resolveOutstandingStatus(1, 0, 5000, 0)).toBe("provisional");
    expect(resolveAggregateStatus(["actual", "provisional"])).toBe("partial");
    expect(resolveAggregateStatus(["actual", "actual"])).toBe("actual");
  });
});
