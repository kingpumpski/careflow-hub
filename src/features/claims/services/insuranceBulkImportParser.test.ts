import { describe, expect, it } from "vitest";
import {
  assertNoConflictingInsurancePeriods,
  parseInsuranceHistorySheet,
} from "./insuranceBulkImportParser";

describe("parseInsuranceHistorySheet", () => {
  it("parses long-layout amounts and uses the year in the sheet name", () => {
    const rows = parseInsuranceHistorySheet("Claims 2025", [
      ["Insurance Company", "Month", "Submitted", "Rejected", "Paid"],
      ["Example Health", "September", "12,500.50", "500", "10,000"],
    ], 2026);
    expect(rows).toEqual([{
      sheet: "Claims 2025",
      sourceRow: 2,
      year: 2025,
      month: 9,
      insurerNameRaw: "Example Health",
      submitted: 12500.5,
      rejected: 500,
      paid: 10000,
    }]);
  });

  it("parses wide month columns and ignores blank cells", () => {
    const rows = parseInsuranceHistorySheet("2026", [
      ["Insurance Company", "Jan", "February 2026", "Mar"],
      ["Example Health", "1,000.25", "", 0],
    ], 2025);
    expect(rows).toEqual([{
      sheet: "2026",
      sourceRow: 2,
      year: 2026,
      month: 1,
      insurerNameRaw: "Example Health",
      submitted: 1000.25,
      rejected: 0,
      paid: 0,
    }]);
  });

  it("accepts month labels that include a year suffix", () => {
    const rows = parseInsuranceHistorySheet("Claims", [
      ["Insurance Company", "Month", "Year", "Submitted"],
      ["Example Health", "Jan-26", 2026, 100],
    ], 2026);
    expect(rows[0].month).toBe(1);
    expect(rows[0].year).toBe(2026);
  });

  it("rejects malformed and negative financial values rather than converting them to zero", () => {
    expect(() => parseInsuranceHistorySheet("2026", [
      ["Insurance Company", "Month", "Submitted", "Rejected", "Paid"],
      ["Example Health", "Jan", "12,3,4", "", ""],
    ], 2026)).toThrow("Submitted must be a valid number");

    expect(() => parseInsuranceHistorySheet("2026", [
      ["Insurance Company", "Month", "Submitted"],
      ["Example Health", "Jan", "-50"],
    ], 2026)).toThrow("Submitted cannot be negative");
  });

  it("rejects invalid month and year values with sheet and row context", () => {
    expect(() => parseInsuranceHistorySheet("Claims", [
      ["Insurance Company", "Month", "Year", "Submitted"],
      ["Example Health", "Jan-XX", 2026, 100],
    ], 2026)).toThrow("Month must be 1-12");

    expect(() => parseInsuranceHistorySheet("Claims", [
      ["Insurance Company", "Month", "Year", "Submitted"],
      ["Example Health", "Jan", "20x6", 100],
    ], 2026)).toThrow("Year must be a four-digit year");
  });
});

describe("assertNoConflictingInsurancePeriods", () => {
  const base = {
    sheet: "2026",
    sourceRow: 2,
    year: 2026,
    month: 1,
    insurerNameRaw: "Example Health",
    submitted: 100,
    rejected: 10,
    paid: 50,
  };

  it("allows exact duplicate source rows to be handled by the existing duplicate audit flow", () => {
    expect(() => assertNoConflictingInsurancePeriods([base, { ...base, sheet: "Jan 2026", sourceRow: 4 }])).not.toThrow();
  });

  it("detects conflicting rows that map to the same insurer ID", () => {
    const first = { ...base, insurerNameRaw: "Example Health Ltd" };
    const second = { ...base, insurerNameRaw: "Example H. Ltd", submitted: 250 };
    expect(() => assertNoConflictingInsurancePeriods([first, second], () => "insurer-id-1"))
      .toThrow("Conflicting entries for Example H. Ltd");
  });

  it("rejects conflicting values for the same insurer and period", () => {
    expect(() => assertNoConflictingInsurancePeriods([base, { ...base, submitted: 200, sheet: "Second sheet", sourceRow: 7 }]))
      .toThrow("Conflicting entries for Example Health");
  });
});
