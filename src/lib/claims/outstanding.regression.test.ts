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

  it("requires both payment and WHT evidence for actual status", () => {
    expect(resolveOutstandingStatus(1, 0)).toBe("provisional");
    expect(resolveOutstandingStatus(0, 1)).toBe("provisional");
    expect(resolveOutstandingStatus(1, 1)).toBe("actual");
    expect(resolveAggregateStatus(["actual", "provisional"])).toBe("provisional");
    expect(resolveAggregateStatus(["actual", "actual"])).toBe("actual");
  });
});
