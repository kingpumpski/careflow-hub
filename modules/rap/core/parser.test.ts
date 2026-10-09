import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { extractParsedItems, parseTabularDocument, parseTabularWorkbook } from "./parser";

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

  it("rejects an unterminated quoted field", () => {
    expect(() => parseTabularDocument('Code,Description\nLAB-1,"broken\n', "CSV")).toThrow(/unterminated/i);
  });

  it("rejects a tabular document without a cost-item-code column", () => {
    const document = parseTabularDocument("Row ID,Amount\n1,20\n", "CSV");
    expect(() => extractParsedItems(document)).toThrow(/cost item code/i);
  });

  it("preserves empty numeric fields as undefined rather than zero", () => {
    const document = parseTabularDocument("Cost Item Code,Quantity,Amount\nLAB-1,,\n", "CSV");
    expect(extractParsedItems(document)[0]).toMatchObject({ costItemCode: "LAB-1", quantity: undefined, amount: undefined });
  });

  it("parses every XLSX worksheet through the same normalized boundary", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Cost Item Code"], ["LAB-1"]]), "Claims");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Cost Item Code"], ["LAB-2"]]), "Second");
    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });

    const documents = parseTabularWorkbook(bytes, "XLSX");
    expect(documents.map((document) => document.sheetName)).toEqual(["Claims", "Second"]);
    expect(extractParsedItems(documents[1])[0].costItemCode).toBe("LAB-2");
  });
});
