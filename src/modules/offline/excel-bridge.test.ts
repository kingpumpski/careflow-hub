import { describe, expect, it } from "vitest";
import { normalizeExcelRows, deserializeExcelValue, serializeExcelValue } from "./excel-schema";

describe("offline Excel bridge", () => {
  it("round-trips structured cell values", () => {
    const value = { status: "prepared", recipients: ["claims@example.com"] };
    expect(deserializeExcelValue(serializeExcelValue(value))).toEqual(value);
  });

  it("normalizes imported rows with stable ids and entity", () => {
    const rows = normalizeExcelRows("preauthorizations", [{ id: "pa-1", total_cost: 1200 }]);
    expect(rows).toEqual([{ id: "pa-1", total_cost: 1200, entity: "preauthorizations" }]);
  });
});
