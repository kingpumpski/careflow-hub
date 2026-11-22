import { describe, expect, it } from "vitest";
import { assertClaimTransition, canTransitionClaim, CLAIM_STATUSES, getAvailableClaimTransitions } from "./lifecycle";
import { getLocalDateInputValue } from "./dateInput";

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

  it("returns only the allowed next statuses for the UI", () => {
    expect(getAvailableClaimTransitions("draft")).toEqual(["verified"]);
    expect(getAvailableClaimTransitions("closed")).toEqual([]);
  });

  it("throws on an invalid transition", () => {
    expect(() => assertClaimTransition("draft", "paid")).toThrow(
      "Invalid claim lifecycle transition: draft -> paid",
    );
  });
});

  
describe("claim date input defaults", () => {
  it("formats the local calendar date without converting through UTC", () => {
    const localDate = new Date(2026, 0, 2, 0, 15, 0);
    expect(getLocalDateInputValue(localDate)).toBe("2026-01-02");
  });
});
