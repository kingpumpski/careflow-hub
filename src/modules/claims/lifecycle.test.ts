import { describe, expect, it } from "vitest";
import { assertClaimTransition, canTransitionClaim, CLAIM_STATUSES } from "./lifecycle";

describe("claim lifecycle", () => {
  it("defines a finite, unique status catalogue", () => {
    expect(CLAIM_STATUSES.length).toBeGreaterThan(5);
    expect(new Set(CLAIM_STATUSES).size).toBe(CLAIM_STATUSES.length);
  });

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
