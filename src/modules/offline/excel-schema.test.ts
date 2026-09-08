import { describe, expect, it } from "vitest";
import { EXCEL_SHEETS, getExcelColumns, getExcelSheetTitle } from "./excel-schema";

describe("CareFlow Excel schema", () => {
  it("defines every operational sheet with a human-readable schema", () => {
    expect(EXCEL_SHEETS.length).toBe(16);
    for (const entity of EXCEL_SHEETS) {
      const columns = getExcelColumns(entity);
      expect(columns.length).toBeGreaterThan(0);
      expect(columns[0].key).toBe("id");
      expect(columns.every((column) => column.heading.trim())).toBe(true);
      expect(columns.every((column) => column.description.trim())).toBe(true);
      expect(getExcelSheetTitle(entity)).not.toContain("_");
    }
  });

  it("marks generated financial fields so officers do not invent them", () => {
    const settlementColumns = getExcelColumns("claims_settlement_periods");
    expect(settlementColumns.find((column) => column.key === "provisional_withholding_tax")?.entry).toBe("system");
    expect(settlementColumns.find((column) => column.key === "actual_withholding_tax")?.entry).toBe("user");
    expect(settlementColumns.find((column) => column.key === "withholding_tax_variance")?.entry).toBe("system");
  });
});
