import { describe, expect, it } from "vitest";
import { changedCoordinates, renderTargetColumn } from "./renderer";
import type { RapTabularDocument } from "./types";

const source: RapTabularDocument = {
  format: "CSV",
  headers: ["Cost Item", "Diagnosis", "Amount"],
  rows: [
    [
      { value: "CODE-1", row: 0, column: 0 },
      { value: "", row: 0, column: 1 },
      { value: 100, row: 0, column: 2 },
    ],
    [
      { value: "CODE-2", row: 1, column: 0 },
      { value: "", row: 1, column: 1 },
      { value: 200, row: 1, column: 2 },
    ],
  ],
};

describe("RAP deterministic renderer", () => {
  it("changes only explicitly targeted cells", () => {
    const rendered = renderTargetColumn(source, [{ row: 0, column: 1, value: "A00.1" }]);
    expect(changedCoordinates(source, rendered)).toEqual(["0:1"]);
    expect(rendered.rows[0][1].value).toBe("A00.1");
    expect(rendered.rows[0][2].value).toBe(100);
    expect(rendered.rows[1][0].value).toBe("CODE-2");
  });

  it("guards formula-injection prefixes in rendered text", () => {
    const rendered = renderTargetColumn(source, [{ row: 0, column: 1, value: "=SUM(A1:A2)" }]);
    expect(rendered.rows[0][1].value).toBe("'=SUM(A1:A2)");
  });
});
