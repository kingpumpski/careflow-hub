import { describe, expect, it } from "vitest";
import { getPreAuthorizationErrorMessage, hasPreAuthorizationRevisionChanged } from "./preauthStudio.service";

describe("pre-authorization edit-session revision guard", () => {
  it("detects a server revision that changed after the edit session opened", () => {
    expect(hasPreAuthorizationRevisionChanged("2026-09-08T10:00:00.000Z", "2026-09-08T10:01:00.000Z")).toBe(true);
  });

  it("does not report a conflict when the captured and current revisions match", () => {
    expect(hasPreAuthorizationRevisionChanged("2026-09-08T10:00:00.000Z", "2026-09-08T10:00:00.000Z")).toBe(false);
  });

  it("does not invent a conflict when a revision is unavailable", () => {
    expect(hasPreAuthorizationRevisionChanged(undefined, "2026-09-08T10:00:00.000Z")).toBe(false);
    expect(hasPreAuthorizationRevisionChanged("2026-09-08T10:00:00.000Z", null)).toBe(false);
  });
});

describe("pre-authorization error normalization", () => {
  const cases = [
    ["PREAUTH_REVISION_CONFLICT", "This pre-authorization was changed elsewhere"],
    ["DUPLICATE_PREAUTH", "A matching pre-authorization already exists"],
    ["TOTAL_COST_MISMATCH", "submitted total does not match"],
    ["PREAUTH_ITEMS_REQUIRED", "at least one valid service or charge line"],
    ["CLIENT_NAME_REQUIRED", "Client name is required"],
    ["INSURER_NAME_REQUIRED", "Insurer name is required"],
    ["FACILITY_REQUIRED", "Select a facility before saving"],
    ["FACILITY_ACCESS_DENIED", "do not have access to the selected facility"],
    ["FACILITY_CONTEXT_MISMATCH", "selected facility changed"],
    ["CHARGE_DESCRIPTION_REQUIRED", "Every charge line must have a description"],
    ["INVALID_CHARGE_VALUE", "invalid value"],
  ] as const;

  it.each(cases)("maps %s to a user-safe message", (code, expectedFragment) => {
    expect(getPreAuthorizationErrorMessage(new Error(code))).toContain(expectedFragment);
  });

  it("preserves an unknown backend message", () => {
    expect(getPreAuthorizationErrorMessage(new Error("Unexpected backend failure"))).toBe("Unexpected backend failure");
  });

  it("provides a safe fallback for an empty error", () => {
    expect(getPreAuthorizationErrorMessage(null)).toBe("Unable to save the pre-authorization.");
  });
});
