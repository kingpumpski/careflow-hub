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

  it("keeps the captured base version out of the persisted record payload", () => {
    const payload = toSupabaseSyncPayload({
      id: "preauth-3",
      name: "Offline edit",
      updated_at: "2026-09-08T11:16:00.000Z",
    });

    expect(payload).toEqual({
      id: "preauth-3",
      name: "Offline edit",
      updated_at: "2026-09-08T11:16:00.000Z",
    });
    expect(payload).not.toHaveProperty("baseVersion");
  });
});