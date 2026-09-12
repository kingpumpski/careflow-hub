import { describe, expect, it } from "vitest";
import { mapRows, type ImportColumn } from "./importUtils";

describe("mapRows", () => {
  const columns: ImportColumn[] = [
    { key: "insurance_company_id", label: "Insurance Company", required: true, type: "lookup", options: [{ label: "Acme Health", value: "ins-1" }] },
    { key: "claim_amount", label: "Claim Amount", required: true, type: "number" },
    { key: "claim_month", label: "Claim Month", required: true, type: "integer" },
    { key: "claim_year", label: "Claim Year", required: true, type: "integer" },
  ];

  it("accepts the asterisk markers emitted by the Excel template", () => {
    const [row] = mapRows([
      {
        "Insurance Company*": "Acme Health",
        "Claim Amount*": "12500.50",
        "Claim Month*": "September",
        "Claim Year*": "2026",
      },
    ], columns);

    expect(row.errors).toEqual([]);
    expect(row.values).toEqual({
      insurance_company_id: "ins-1",
      claim_amount: 12500.5,
      claim_month: 9,
      claim_year: 2026,
    });
  });

  it("accepts BOM-prefixed headers and human-entered spacing", () => {
    const [row] = mapRows([
      {
        "\uFEFF Insurance Company * ": "Acme Health",
        "Claim Amount *": "10,000",
        "Claim Month *": 2,
        "Claim Year *": 2026,
      },
    ], columns);

    expect(row.errors).toEqual([]);
    expect(row.values.claim_amount).toBe(10000);
    expect(row.values.claim_month).toBe(2);
    expect(row.values.claim_year).toBe(2026);
  });
});
