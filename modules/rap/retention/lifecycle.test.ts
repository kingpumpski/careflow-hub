import { describe, expect, it, vi } from "vitest";
import { deleteExpiredBatch, type RapRetentionRecord, type RapRetentionRepository, type RapBinaryStore } from "./lifecycle";

const expired = (overrides: Partial<RapRetentionRecord> = {}): RapRetentionRecord => ({
  adviceId: "advice-1",
  status: "ACTIVE",
  retentionExpiresAt: "2020-01-01T00:00:00.000Z",
  legalHold: false,
  ...overrides,
});

function dependencies(records: RapRetentionRecord[]) {
  const calls: string[] = [];
  const repository: RapRetentionRepository = {
    lockBatch: vi.fn().mockResolvedValue(records),
    saveCompression: vi.fn().mockResolvedValue(undefined),
    markDeleted: vi.fn().mockImplementation(async (id: string) => { calls.push(`mark:${id}`); }),
    appendEvent: vi.fn().mockImplementation(async () => { calls.push("event"); return true; }),
  };
  const binaryStore: RapBinaryStore = {
    read: vi.fn().mockResolvedValue(new Uint8Array([1])),
    delete: vi.fn().mockImplementation(async (id: string) => { calls.push(`delete:${id}`); }),
  };
  return { repository, binaryStore, calls };
}

describe("RAP retention deletion", () => {
  it("never treats an invalid expiration timestamp as expired", async () => {
    const deps = dependencies([expired({ retentionExpiresAt: "not-a-date" })]);
    await expect(deleteExpiredBatch(deps.repository, deps.binaryStore, () => "certificate")).resolves.toBe(0);
    expect(deps.binaryStore.delete).not.toHaveBeenCalled();
    expect(deps.repository.markDeleted).not.toHaveBeenCalled();
  });

  it("respects legal holds and active retention windows", async () => {
    const deps = dependencies([
      expired({ adviceId: "held", legalHold: true }),
      expired({ adviceId: "future", retentionExpiresAt: "2999-01-01T00:00:00.000Z" }),
      expired({ adviceId: "done", status: "DELETED" }),
    ]);
    await expect(deleteExpiredBatch(deps.repository, deps.binaryStore, () => "certificate")).resolves.toBe(0);
    expect(deps.binaryStore.delete).not.toHaveBeenCalled();
  });

  it("records deletion only after the binary and repository are updated", async () => {
    const deps = dependencies([expired()]);
    await expect(deleteExpiredBatch(deps.repository, deps.binaryStore, () => "cert-1")).resolves.toBe(1);
    expect(deps.calls).toEqual(["delete:advice-1", "mark:advice-1", "event"]);
  });

  it("does not record a completed deletion if binary deletion fails", async () => {
    const deps = dependencies([expired()]);
    vi.mocked(deps.binaryStore.delete).mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(deleteExpiredBatch(deps.repository, deps.binaryStore, () => "cert-1")).rejects.toThrow("storage unavailable");
    expect(deps.repository.appendEvent).not.toHaveBeenCalled();
    expect(deps.repository.markDeleted).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, 5001, Number.NaN])("rejects invalid batch limit %s", async (limit) => {
    const deps = dependencies([]);
    await expect(deleteExpiredBatch(deps.repository, deps.binaryStore, () => "cert-1", limit)).rejects.toThrow(/batch limit/);
    expect(deps.repository.lockBatch).not.toHaveBeenCalled();
  });
});
