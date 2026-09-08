import { describe, expect, it } from "vitest";
import { assertClaimTransition, canTransitionClaim } from "./lifecycle";

describe("claim lifecycle", () => {
  it("allows valid forward transitions", () => {
    expect(canTransitionClaim("draft", "verified")).toBe(true);
    expect(canTransitionClaim("submitted", "under_review")).toBe(true);
    expect(canTransitionClaim("approved", "paid")).toBe(true);
    expect(canTransitionClaim("paid", "closed")).toBe(true);
  });

  it("blocks invalid transitions", () => {
    expect(canTransitionClaim("draft", "paid")).toBe(false);
    expect(canTransitionClaim("closed", "draft")).toBe(false);
  });

  it("throws on an invalid transition", () => {
    expect(() => assertClaimTransition("draft", "paid")).toThrow(
      "Invalid claim lifecycle transition: draft -> paid",
    );
  });
});
