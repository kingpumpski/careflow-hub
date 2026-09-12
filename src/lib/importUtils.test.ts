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
});
