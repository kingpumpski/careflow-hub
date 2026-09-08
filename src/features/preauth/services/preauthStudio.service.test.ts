import { describe, expect, it } from "vitest";
import { hasPreAuthorizationRevisionChanged } from "./preauthStudio.service";

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
