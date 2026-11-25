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

  it("matches the approved-in-source transition matrix for every status pair", () => {
    const expected: Record<(typeof CLAIM_STATUSES)[number], readonly (typeof CLAIM_STATUSES)[number][]> = {
      draft: ["verified"],
      verified: ["submitted", "draft"],
      submitted: ["acknowledged", "under_review", "queried", "rejected"],
      acknowledged: ["under_review", "queried", "rejected"],
      under_review: ["queried", "approved", "partially_approved", "rejected"],
      queried: ["verified", "submitted", "under_review", "rejected"],
      approved: ["partially_paid", "paid", "reconciled"],
      partially_approved: ["partially_paid", "paid", "appealed", "reconciled"],
      rejected: ["appealed", "closed", "submitted"],
      appealed: ["approved", "partially_approved", "rejected", "closed"],
      partially_paid: ["paid", "reconciled"],
      paid: ["reconciled", "closed"],
      reconciled: ["closed"],
      closed: [],
    };

    for (const from of CLAIM_STATUSES) {
      expect(getAvailableClaimTransitions(from)).toEqual(expected[from]);
      for (const to of CLAIM_STATUSES) {
        expect(canTransitionClaim(from, to)).toBe(expected[from].includes(to));
      }
    }
  });

  it("keeps terminal closure and reconciliation states from reopening", () => {
    for (const terminal of ["reconciled", "closed"] as const) {
      expect(getAvailableClaimTransitions(terminal)).not.toContain("draft");
      expect(getAvailableClaimTransitions(terminal)).not.toContain("submitted");
    }
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
