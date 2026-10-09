import type { RapRetentionStatus } from "./policy";

export type RapRetentionEventType = "COMPRESSED" | "NOTICE_T7" | "NOTICE_T1" | "EXPIRED" | "DELETED" | "LEGAL_HOLD" | "EXTENDED";

export interface RapRetentionRecord {
  adviceId: string;
  status: RapRetentionStatus;
  retentionExpiresAt: string;
  legalHold: boolean;
  binaryChecksum?: string;
  compressedAt?: string;
}

export interface RapRetentionRepository {
  /** Must claim rows atomically (for example SELECT ... FOR UPDATE SKIP LOCKED). */
  lockBatch(limit: number): Promise<RapRetentionRecord[]>;
  saveCompression(record: RapRetentionRecord, compressedBytes: Uint8Array, checksum: string): Promise<void>;
  markDeleted(adviceId: string, certificateId: string): Promise<void>;
  appendEvent(event: { adviceId: string; eventType: RapRetentionEventType; idempotencyKey: string }): Promise<boolean>;
}

export interface RapRetentionNotifier {
  notify(input: { adviceId: string; eventType: RapRetentionEventType; idempotencyKey: string }): Promise<void>;
}

export interface RapBinaryStore {
  read(adviceId: string): Promise<Uint8Array>;
  /** Implementations must treat deleting an already-absent object as success. */
  delete(adviceId: string): Promise<void>;
}

function assertBatchLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5000) {
    throw new Error("RAP retention batch limit must be an integer between 1 and 5000.");
  }
}

export async function compressRetentionBatch(
  repository: RapRetentionRepository,
  binaryStore: RapBinaryStore,
  compressor: (input: Uint8Array) => Uint8Array,
  checksum: (input: Uint8Array) => string,
  limit = 500,
): Promise<number> {
  assertBatchLimit(limit);
  const records = await repository.lockBatch(limit);
  let processed = 0;
  for (const record of records) {
    if (record.status === "DELETED" || record.legalHold) continue;
    if (record.compressedAt) {
      // Retry an event append that may have failed after compression was saved.
      await repository.appendEvent({ adviceId: record.adviceId, eventType: "COMPRESSED", idempotencyKey: `${record.adviceId}:COMPRESSED` });
      continue;
    }
    const original = await binaryStore.read(record.adviceId);
    const compressed = compressor(original);
    const digest = checksum(compressed);
    await repository.saveCompression({ ...record, status: "COMPRESSED", compressedAt: new Date().toISOString(), binaryChecksum: digest }, compressed, digest);
    await repository.appendEvent({ adviceId: record.adviceId, eventType: "COMPRESSED", idempotencyKey: `${record.adviceId}:COMPRESSED` });
    processed += 1;
  }
  return processed;
}

export async function deleteExpiredBatch(
  repository: RapRetentionRepository,
  binaryStore: RapBinaryStore,
  certificateId: (adviceId: string) => string,
  limit = 500,
): Promise<number> {
  assertBatchLimit(limit);
  const records = await repository.lockBatch(limit);
  let deleted = 0;
  const now = Date.now();
  for (const record of records) {
    if (record.legalHold) continue;
    if (record.status === "DELETED") {
      // A prior attempt may have committed storage/row deletion but failed to
      // append the event. Retry the idempotent append without deleting again.
      await repository.appendEvent({
        adviceId: record.adviceId,
        eventType: "DELETED",
        idempotencyKey: `${record.adviceId}:DELETED:${record.retentionExpiresAt}`,
      });
      continue;
    }
    const expiresAt = new Date(record.retentionExpiresAt).getTime();
    // Invalid timestamps must never be interpreted as expired.
    if (!Number.isFinite(expiresAt) || expiresAt > now) continue;

    // Keep the idempotency event last: recording DELETED before storage deletion
    // could strand a binary if deletion fails and retries see the existing event.
    await binaryStore.delete(record.adviceId);
    await repository.markDeleted(record.adviceId, certificateId(record.adviceId));
    await repository.appendEvent({
      adviceId: record.adviceId,
      eventType: "DELETED",
      idempotencyKey: `${record.adviceId}:DELETED:${record.retentionExpiresAt}`,
    });
    deleted += 1;
  }
  return deleted;
}
