import { describe, expect, it } from "vitest";
import { isMissingLetterheadSettingsRpc } from "./letterheadSettings";

describe("report letterhead RPC compatibility", () => {
  it("recognizes PostgREST missing-function responses", () => {
    expect(isMissingLetterheadSettingsRpc({ code: "PGRST202", message: "Could not find the function" })).toBe(true);
  });

  it("recognizes PostgreSQL undefined-function responses", () => {
    expect(isMissingLetterheadSettingsRpc({ code: "42883", message: "function does not exist" })).toBe(true);
  });

  it("does not treat authorization or unrelated database errors as a missing RPC", () => {
    expect(isMissingLetterheadSettingsRpc({ code: "42501", message: "Report access is required" })).toBe(false);
    expect(isMissingLetterheadSettingsRpc({ code: "PGRST205", message: "relation is missing" })).toBe(false);
  });

  it("returns false when no error exists", () => {
    expect(isMissingLetterheadSettingsRpc(null)).toBe(false);
  });
});
