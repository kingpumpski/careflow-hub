import { describe, expect, it } from "vitest";
import {
  addMoney,
  compareMoney,
  fromMinorUnits,
  multiplyMoney,
  subtractMoney,
  toMinorUnits,
} from "./decimalMoney";

describe("decimal-safe financial arithmetic", () => {
  it("adds decimal amounts without binary floating-point drift", () => {
    expect(addMoney("0.10", "0.20", "GHS")).toBe("0.30");
    expect(addMoney("123456789012345.67", "0.33", "GHS")).toBe("123456789012346.00");
  });

  it("subtracts amounts and preserves negative variances", () => {
    expect(subtractMoney("1000.00", "900.00", "GHS")).toBe("100.00");
    expect(subtractMoney("10.00", "12.50", "GHS")).toBe("-2.50");
  });

  it("uses ISO currency fraction digits", () => {
    expect(toMinorUnits("123.456", "GHS")).toBe(12346n);
    expect(fromMinorUnits(123n, "JPY")).toBe("123");
    expect(fromMinorUnits(123456n, "KWD")).toBe("123.456");
  });

  it("rounds half away from zero at the currency boundary", () => {
    expect(toMinorUnits("1.005", "USD")).toBe(101n);
    expect(toMinorUnits("-1.005", "USD")).toBe(-101n);
  });

  it("multiplies by exact decimal factors for tax and allocation calculations", () => {
    expect(multiplyMoney("900.00", "0.025", "GHS")).toBe("22.50");
    expect(multiplyMoney("100.00", "0.3333", "GHS")).toBe("33.33");
  });

  it("compares normalized monetary values", () => {
    expect(compareMoney("10.0", "10.00", "GHS")).toBe(0);
    expect(compareMoney("9.99", "10.00", "GHS")).toBe(-1);
    expect(compareMoney("10.01", "10.00", "GHS")).toBe(1);
  });

  it("rejects invalid and non-finite values", () => {
    expect(() => toMinorUnits("1,000.00", "GHS")).toThrow("Invalid decimal amount");
    expect(() => toMinorUnits(Number.NaN, "GHS")).toThrow("Money amount must be finite.");
    expect(() => toMinorUnits("1.00", "NOT-A-CURRENCY")).toThrow("Unsupported ISO 4217 currency code");
  });
});
