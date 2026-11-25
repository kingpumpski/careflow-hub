import { describe, expect, it } from "vitest";
import { isMissingSchemaError, MissingSchemaError } from "./schemaFallback";

describe("missing schema handling", () => {
  it("identifies a missing PostgREST relation", () => {
    expect(isMissingSchemaError({ code: "PGRST205", message: "Could not find the table" })).toBe(true);
  });

  it("identifies a missing SQL function", () => {
    expect(isMissingSchemaError({ code: "42883", message: "function does not exist" })).toBe(true);
  });

  it("does not classify unrelated database errors as missing schema", () => {
    expect(isMissingSchemaError({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingSchemaError({ code: "23505", message: "duplicate key" })).toBe(false);
  });

  it("provides a clear typed error for critical data sources", () => {
    const error = new MissingSchemaError("claims_settlement_remittances");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("MissingSchemaError");
    expect(error.code).toBe("CARE_FLOW_SCHEMA_UNAVAILABLE");
    expect(error.table).toBe("claims_settlement_remittances");
    expect(error.message).toContain("no records have been assumed or created");
  });
});
