import { describe, expect, it } from "vitest";
import { extractParsedItems, parseTabularDocument } from "./parser";

describe("RAP tabular parser", () => {
  it("parses CSV rows and extracts claim-item fields deterministically", () => {
    const document = parseTabularDocument(
      "Row ID,Cost Item Code,Description,Quantity,Amount,Rejection Reason,Diagnosis\n7,LAB-001,Blood test,2,50,Not covered,A00.1;B00.2\n",
      "CSV",
    );
    expect(document.headers).toEqual(["Row ID", "Cost Item Code", "Description", "Quantity", "Amount", "Rejection Reason", "Diagnosis"]);
    expect(extractParsedItems(document)[0]).toMatchObject({
      rowId: "7",
      costItemCode: "LAB-001",
      quantity: 2,
      amount: 50,
      rejectionReason: "Not covered",
      diagnosisCodes: ["A00.1", "B00.2"],
    });
  });

  it("supports quoted delimiters and embedded line breaks", () => {
    const document = parseTabularDocument('Code,Description\nLAB-1,"Test, panel"\n', "CSV");
    expect(document.rows[1][1].value).toBe("Test, panel");
  });

  it("rejects a tabular document without a cost-item-code column", () => {
    const document = parseTabularDocument("Row ID,Amount\n1,20\n", "CSV");
    expect(() => extractParsedItems(document)).toThrow(/cost item code/i);
  });
});
