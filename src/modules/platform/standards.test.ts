import { describe, expect, it } from "vitest";
import { DEFAULT_PLATFORM_LOCALE, formatDate, formatMoney } from "./standards";

describe("platform locale standards", () => {
  it("keeps the first deployment's locale configurable", () => {
    expect(DEFAULT_PLATFORM_LOCALE.countryCode).toBe("GH");
    expect(DEFAULT_PLATFORM_LOCALE.currencyCode).toBe("GHS");
    expect(DEFAULT_PLATFORM_LOCALE.timeZone).toBe("Africa/Accra");
  });

  it("formats money with an explicit deployment currency and locale", () => {
    const config = { ...DEFAULT_PLATFORM_LOCALE, currencyCode: "USD", locale: "en-US" };
    expect(formatMoney(1234.5, config)).toBe("$1,234.50");
  });

  it("formats dates using the configured time zone", () => {
    const config = {
      ...DEFAULT_PLATFORM_LOCALE,
      locale: "en-US",
      timeZone: "UTC",
      dateFormat: { month: "2-digit", day: "2-digit", year: "numeric" } satisfies Intl.DateTimeFormatOptions,
    };
    expect(formatDate("2026-11-20T00:00:00.000Z", config)).toBe("11/20/2026");
  });

  it("rejects invalid money and date inputs", () => {
    expect(() => formatMoney(Number.NaN)).toThrow("Money amount must be a finite number.");
    expect(() => formatDate("not-a-date")).toThrow("Date value is invalid.");
  });
});
