import { describe, expect, it } from "vitest";
import { loadRapRuntimeConfig, RAP_DEFAULTS } from "./config";

describe("RAP runtime configuration", () => {
  it("defaults every feature gate to disabled and uses conservative defaults", () => {
    const config = loadRapRuntimeConfig({});
    expect(config.enabled).toBe(false);
    expect(config.retentionEnabled).toBe(false);
    expect(config.agentClaimsEnabled).toBe(false);
    expect(config.agentAdminEnabled).toBe(false);
    expect(config.agentItEnabled).toBe(false);
    expect(config.minimumAiConfidence).toBe(0.85);
    expect(config.approvalTokenTtlMinutes).toBe(15);
    expect(config.defaultRetentionDays).toBe(90);
    expect(config.jsonRetentionDays).toBe(365);
    expect(RAP_DEFAULTS.enabled).toBe(false);
  });

  it("parses explicit booleans without treating invalid values as false", () => {
    expect(loadRapRuntimeConfig({ RAP_ENABLED: " TRUE " }).enabled).toBe(true);
    expect(loadRapRuntimeConfig({ RAP_ENABLED: "false" }).enabled).toBe(false);
    expect(() => loadRapRuntimeConfig({ RAP_ENABLED: "yes" })).toThrow(/RAP_ENABLED/);
  });

  it("rejects confidence outside the inclusive zero-to-one range", () => {
    expect(loadRapRuntimeConfig({ RAP_MIN_AI_CONFIDENCE: "0" }).minimumAiConfidence).toBe(0);
    expect(loadRapRuntimeConfig({ RAP_MIN_AI_CONFIDENCE: "1" }).minimumAiConfidence).toBe(1);
    expect(() => loadRapRuntimeConfig({ RAP_MIN_AI_CONFIDENCE: "1.01" })).toThrow(/between 0 and 1/);
    expect(() => loadRapRuntimeConfig({ RAP_MIN_AI_CONFIDENCE: "NaN" })).toThrow(/finite number/);
  });

  it("limits approval-token TTL to the documented 15-minute maximum", () => {
    expect(loadRapRuntimeConfig({ RAP_APPROVAL_TOKEN_TTL_MINUTES: "1" }).approvalTokenTtlMinutes).toBe(1);
    expect(loadRapRuntimeConfig({ RAP_APPROVAL_TOKEN_TTL_MINUTES: "15" }).approvalTokenTtlMinutes).toBe(15);
    for (const value of ["0", "16", "-1", "1.5", "Infinity"]) {
      expect(() => loadRapRuntimeConfig({ RAP_APPROVAL_TOKEN_TTL_MINUTES: value })).toThrow(/RAP_APPROVAL_TOKEN_TTL_MINUTES/);
    }
  });

  it("requires retention periods to be whole days in a bounded range", () => {
    expect(loadRapRuntimeConfig({ RAP_DEFAULT_RETENTION_DAYS: "0", RAP_JSON_RETENTION_DAYS: "36500" }))
      .toMatchObject({ defaultRetentionDays: 0, jsonRetentionDays: 36500 });
    for (const value of ["-1", "36501", "1.2", "Infinity"]) {
      expect(() => loadRapRuntimeConfig({ RAP_DEFAULT_RETENTION_DAYS: value })).toThrow(/RAP_DEFAULT_RETENTION_DAYS/);
      expect(() => loadRapRuntimeConfig({ RAP_JSON_RETENTION_DAYS: value })).toThrow(/RAP_JSON_RETENTION_DAYS/);
    }
  });
});
