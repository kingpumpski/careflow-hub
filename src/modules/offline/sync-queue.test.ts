import { describe, expect, it } from "vitest";

import { toSupabaseSyncPayload } from "./sync-queue";

describe("offline sync payload normalization", () => {
  it("removes local metadata and maps local timestamps to Supabase columns", () => {
    expect(toSupabaseSyncPayload({
      id: "preauth-1",
      entity: "preauthorizations",
      storageKey: "preauthorizations:preauth-1",
      createdAt: "2026-09-08T10:00:00.000Z",
      updatedAt: "2026-09-08T10:05:00.000Z",
      facility_id: "facility-1",
    })).toEqual({
      id: "preauth-1",
      created_at: "2026-09-08T10:00:00.000Z",
      updated_at: "2026-09-08T10:05:00.000Z",
      facility_id: "facility-1",
    });
  });

  it("preserves canonical snake_case timestamps when already supplied", () => {
    expect(toSupabaseSyncPayload({
      id: "preauth-2",
      created_at: "2026-09-08T11:00:00.000Z",
      updated_at: "2026-09-08T11:05:00.000Z",
      createdAt: "local-value",
      updatedAt: "local-value",
    })).toEqual({
      id: "preauth-2",
      created_at: "2026-09-08T11:00:00.000Z",
      updated_at: "2026-09-08T11:05:00.000Z",
    });
  });

  it("strips client-only base version metadata before persistence", () => {
    const payload = toSupabaseSyncPayload({
      id: "preauth-3",
      name: "Offline edit",
      updated_at: "2026-09-08T11:16:00.000Z",
      baseVersion: "2026-09-08T11:05:00.000Z",
    });

    expect(payload).toEqual({
      id: "preauth-3",
      name: "Offline edit",
      updated_at: "2026-09-08T11:16:00.000Z",
    });
    expect(payload).not.toHaveProperty("baseVersion");
  });
});

describe("database capability-aware offline sync", () => {
  it("recognizes missing optional relations without disabling base settlement periods", async () => {
    const { isDatabaseCapabilityAvailable } = await import("@/config/databaseTableCapabilities");
    const disabled = {
      preAuthPreparedHandoff: false,
      individualClaimCases: false,
      settlementExceptions: false,
      settlementRemittanceLedger: false,
      facilityAdministration: false,
    };
    expect(isDatabaseCapabilityAvailable("settlement_exceptions", disabled)).toBe(false);
    expect(isDatabaseCapabilityAvailable("settlement_exception_audit_events", disabled)).toBe(false);
    expect(isDatabaseCapabilityAvailable("claims_settlement_periods", disabled)).toBe(true);
  });
});
