import { describe, expect, it } from "vitest";
import { buildRetentionSchedule, resolveRetentionDays } from "./policy";

describe("RAP retention policy", () => {
  it("uses the highest-priority valid retention rule", () => {
    expect(resolveRetentionDays({
      explicitOverrideDays: -1,
      partnerPolicyDays: 120,
      claimTypeDays: 60,
      globalDays: 90,
      ghanaLegalMinimumDays: 30,
    })).toEqual({ days: 120, source: "PARTNER_POLICY" });
  });

  it("rejects a policy with no valid retention period", () => {
    expect(() => resolveRetentionDays({
      explicitOverrideDays: -1,
      partnerPolicyDays: Number.NaN,
      claimTypeDays: 1.5,
      globalDays: -3,
      ghanaLegalMinimumDays: Number.POSITIVE_INFINITY,
    })).toThrow(/no valid retention period/i);
  });

  it("builds a deterministic expiry and notice schedule", () => {
    const schedule = buildRetentionSchedule(new Date("2026-01-01T00:00:00.000Z"), 30, 7, 1);
    expect(schedule.expiresAt.toISOString()).toBe("2026-01-31T00:00:00.000Z");
    expect(schedule.notifyAt.map((date) => date.toISOString())).toEqual([
      "2026-01-24T00:00:00.000Z",
      "2026-01-30T00:00:00.000Z",
      "2026-01-31T00:00:00.000Z",
    ]);
  });

  it("rejects invalid dates and non-whole or negative schedule offsets", () => {
    expect(() => buildRetentionSchedule(new Date("invalid"), 30)).toThrow(/valid date/i);
    expect(() => buildRetentionSchedule(new Date("2026-01-01T00:00:00.000Z"), -1)).toThrow(/retentionDays/i);
    expect(() => buildRetentionSchedule(new Date("2026-01-01T00:00:00.000Z"), 30, -1)).toThrow(/notifyLeadDays/i);
    expect(() => buildRetentionSchedule(new Date("2026-01-01T00:00:00.000Z"), 30, 7, 1.5)).toThrow(/reminderDays/i);
  });
});
