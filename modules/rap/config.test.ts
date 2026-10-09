import { describe, expect, it } from "vitest";
import { loadRapRuntimeConfig, RAP_DEFAULTS } from "./config";

describe("RAP runtime configuration", () => {
  it("defaults feature gates off and uses conservative values", () => {
    const config = loadRapRuntimeConfig({});
    expect(config).toMatchObject({
      enabled: false,
      retentionEnabled: false,
      agentClaimsEnabled: false,
      agentAdminEnabled: false,
      agentItEnabled: false,
      minimumAiConfidence: 0.85,
      approvalTokenTtlMinutes: 15,
      defaultRetentionDays: 90,
      jsonRetentionDays: 365,
    });
    expect(RAP_DEFAULTS.enabled).toBe(false);
  });

  it("accepts explicit booleans but rejects malformed values", () => {
    expect(loadRapRuntimeConfig({ RAP_ENABLED: " TRUE " }).enabled).toBe(true);
    expect(loadRapRuntimeConfig({ RAP_ENABLED: "false" }).enabled).toBe(false);
    expect(() => loadRapRuntimeConfig({ RAP_ENABLED: "yes" })).toThrow(/RAP_ENABLED/);
  });

  it("requires a finite AI confidence threshold in the inclusive zero-to-one range", () => {
    expect(loadRapRuntimeConfig({ RAP_MIN_AI_CONFIDENCE: "0" }).minimumAiConfidence).toBe(0);
    expect(loadRapRuntimeConfig({ RAP_MIN_AI_CONFIDENCE: "1" }).minimumAiConfidence).toBe(1);
    for (const value of ["-0.1", "1.01", "NaN", "Infinity"]) {
      expect(() => loadRapRuntimeConfig({ RAP_MIN_AI_CONFIDENCE: value })).toThrow();
    }
  });

  it("caps approval-token lifetime at 15 whole minutes", () => {
    for (const value of ["0", "16", "-1", "1.5", "Infinity"]) {
      expect(() => loadRapRuntimeConfig({ RAP_APPROVAL_TOKEN_TTL_MINUTES: value })).toThrow(/RAP_APPROVAL_TOKEN_TTL_MINUTES/);
    }
  });

  it("requires retention periods to be whole days within bounded limits", () => {
    for (const value of ["-1", "36501", "1.2", "Infinity"]) {
      expect(() => loadRapRuntimeConfig({ RAP_DEFAULT_RETENTION_DAYS: value })).toThrow(/RAP_DEFAULT_RETENTION_DAYS/);
      expect(() => loadRapRuntimeConfig({ RAP_JSON_RETENTION_DAYS: value })).toThrow(/RAP_JSON_RETENTION_DAYS/);
    }
  });
});
