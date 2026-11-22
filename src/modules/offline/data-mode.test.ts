import { describe, expect, it } from "vitest";
import { resolveCareFlowDataMode } from "./data-mode";

describe("resolveCareFlowDataMode", () => {
  it("keeps explicitly configured modes authoritative", () => {
    expect(resolveCareFlowDataMode("offline", true, true, true)).toBe("offline");
    expect(resolveCareFlowDataMode("supabase", false, false, false)).toBe("supabase");
  });

  it("does not treat an uncompleted reachability probe as offline authorization", () => {
    expect(resolveCareFlowDataMode("hybrid", true, true, null)).toBe("supabase");
  });

  it("falls back to offline only after a failed probe or unavailable connection", () => {
    expect(resolveCareFlowDataMode("hybrid", true, true, false)).toBe("offline");
    expect(resolveCareFlowDataMode("hybrid", false, true, null)).toBe("offline");
    expect(resolveCareFlowDataMode("hybrid", true, false, null)).toBe("offline");
  });

  it("returns to Supabase mode after a successful probe", () => {
    expect(resolveCareFlowDataMode("hybrid", true, true, true)).toBe("supabase");
  });
});
