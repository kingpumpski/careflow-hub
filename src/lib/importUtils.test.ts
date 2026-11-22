import { describe, expect, it } from "vitest";
import { mapRows, type ImportColumn } from "./importUtils";

describe("mapRows", () => {
  const columns: ImportColumn[] = [
    { key: "insurance_company_id", label: "Insurance Company", required: true, type: "lookup", options: [{ label: "Acme Health", value: "ins-1" }] },
    { key: "claim_amount", label: "Claim Amount", required: true, type: "number", min: 0 },
    { key: "claim_month", label: "Claim Month", required: true, type: "integer", min: 1, max: 12 },
    { key: "claim_year", label: "Claim Year", required: true, type: "integer", min: 2000, max: 2100 },
  ];

  it("accepts the asterisk markers emitted by the Excel template", () => {
    const [row] = mapRows([{
      "Insurance Company*": "Acme Health",
      "Claim Amount*": "12500.50",
      "Claim Month*": "September",
      "Claim Year*": "2026",
    }], columns);
    expect(row.errors).toEqual([]);
    expect(row.values).toEqual({ insurance_company_id: "ins-1", claim_amount: 12500.5, claim_month: 9, claim_year: 2026 });
  });

  it("accepts BOM-prefixed headers and human-entered spacing", () => {
    const [row] = mapRows([{
      "\uFEFF Insurance Company * ": "Acme Health",
      "Claim Amount *": "10,000",
      "Claim Month *": 2,
      "Claim Year *": 2026,
    }], columns);
    expect(row.errors).toEqual([]);
    expect(row.values.claim_amount).toBe(10000);
    expect(row.values.claim_month).toBe(2);
    expect(row.values.claim_year).toBe(2026);
  });

  it("accepts common external header aliases", () => {
    const [row] = mapRows([{
      Insurer: "Acme Health",
      Amount: "5,250.75",
      Month: "March",
      Year: 2026,
    }], columns.map((column) => ({ ...column, aliases: column.key === "insurance_company_id" ? ["Insurer"] : column.key === "claim_amount" ? ["Amount"] : column.key === "claim_month" ? ["Month"] : ["Year"] })));
    expect(row.errors).toEqual([]);
    expect(row.values).toEqual({ insurance_company_id: "ins-1", claim_amount: 5250.75, claim_month: 3, claim_year: 2026 });
  });

  it("rejects invalid claim periods and negative amounts", () => {
    const [row] = mapRows([{
      "Insurance Company": "Acme Health",
      "Claim Amount": "-10",
      "Claim Month": 13,
      "Claim Year": 1999,
    }], columns);
    expect(row.errors).toContain("Claim Amount must be at least 0");
    expect(row.errors).toContain("Claim Month must be at most 12");
    expect(row.errors).toContain("Claim Year must be at least 2000");
  });

  it("rejects fractional integer values instead of silently rounding them", () => {
    const [row] = mapRows([{
      "Insurance Company": "Acme Health",
      "Claim Amount": 100,
      "Claim Month": 1.5,
      "Claim Year": 2026,
    }], columns);
    expect(row.errors).toContain("Claim Month must be a whole number");
  });

  it("rejects malformed numbers rather than stripping invalid characters", () => {
    const [row] = mapRows([{
      "Insurance Company": "Acme Health",
      "Claim Amount": "12,3,4",
      "Claim Month": 1,
      "Claim Year": 2026,
    }], columns);
    expect(row.errors).toContain("Claim Amount must be a valid number");
  });

  it("rejects impossible dates and unrecognized boolean values", () => {
    const [row] = mapRows([{ ServiceDate: "2026-02-30", Active: "maybe" }], [
      { key: "service_date", label: "Service Date", type: "date" , aliases: ["ServiceDate"] },
      { key: "active", label: "Active", type: "boolean" },
    ]);
    expect(row.errors).toContain("Service Date must be a valid date (YYYY-MM-DD)");
    expect(row.errors).toContain("Active must be yes or no");
  });

  it("accepts valid leap dates, day-first dates and explicit false booleans", () => {
    const [row] = mapRows([{ ISODate: "2024-02-29", LocalDate: "31/12/2026", Enabled: "No" }], [
      { key: "iso_date", label: "ISO Date", type: "date" },
      { key: "local_date", label: "Local Date", type: "date" },
      { key: "enabled", label: "Enabled", type: "boolean" },
    ]);
    expect(row.errors).toEqual([]);
    expect(row.values).toEqual({ iso_date: "2024-02-29", local_date: "2026-12-31", enabled: false });
  });

  it("flags repeated unique diagnosis codes in the same file", () => {
    const [first, second] = mapRows([
      { Code: "a09.0", Description: "First" },
      { Code: " A09.0 ", Description: "Second" },
    ], [
      { key: "code", label: "Code", required: true, unique: true },
      { key: "description", label: "Description", required: true },
    ]);
    expect(first.errors).toEqual([]);
    expect(second.errors).toContain('Code "A09.0" duplicates row 2');
  });
});
