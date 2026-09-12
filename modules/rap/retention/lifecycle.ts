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
  delete(adviceId: string): Promise<void>;
}

export async function compressRetentionBatch(
  repository: RapRetentionRepository,
  binaryStore: RapBinaryStore,
  compressor: (input: Uint8Array) => Uint8Array,
  checksum: (input: Uint8Array) => string,
  limit = 500,
): Promise<number> {
  const records = await repository.lockBatch(limit);
  let processed = 0;
  for (const record of records) {
    if (record.compressedAt || record.status === "DELETED" || record.legalHold) continue;
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
  const records = await repository.lockBatch(limit);
  let deleted = 0;
  const now = Date.now();
  for (const record of records) {
    if (record.legalHold || record.status === "DELETED" || new Date(record.retentionExpiresAt).getTime() > now) continue;
    const eventKey = `${record.adviceId}:DELETED:${record.retentionExpiresAt}`;
    const inserted = await repository.appendEvent({ adviceId: record.adviceId, eventType: "DELETED", idempotencyKey: eventKey });
    if (!inserted) continue;
    await binaryStore.delete(record.adviceId);
    await repository.markDeleted(record.adviceId, certificateId(record.adviceId));
    deleted += 1;
  }
  return deleted;
}
