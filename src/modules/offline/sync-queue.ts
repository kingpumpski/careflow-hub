import { supabase } from "@/integrations/supabase/client";

export type SyncOperationType = "insert" | "update" | "delete";
export type SyncOperationStatus = "pending" | "failed" | "blocked";

export interface SyncOperation {
  id: string;
  table: string;
  type: SyncOperationType;
  recordId: string;
  facilityId?: string;
  actorId?: string;
  idempotencyKey?: string;
  baseVersion?: string | number;
  payload?: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  nextAttemptAt: string;
  status: SyncOperationStatus;
  lastError?: string;
  lastErrorCode?: string;
}

export interface SyncQueueSummary {
  pending: number;
  failed: number;
  blocked: number;
}

const DB_NAME = "careflow-sync-queue";
const DB_VERSION = 2;
const STORE_NAME = "operations";
const MAX_RETRY_DELAY_MS = 15 * 60_000;
const MAX_AUTOMATIC_ATTEMPTS = 8;

function openSyncDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB is unavailable in this browser.")); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Unable to open CareFlow sync queue."));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("nextAttemptAt", "nextAttemptAt", { unique: false });
      } else {
        const store = request.transaction?.objectStore(STORE_NAME);
        if (store && !store.indexNames.contains("status")) store.createIndex("status", "status", { unique: false });
        if (store && !store.indexNames.contains("nextAttemptAt")) store.createIndex("nextAttemptAt", "nextAttemptAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

export async function enqueueSyncOperation(operation: Omit<SyncOperation, "id" | "createdAt" | "attempts" | "nextAttemptAt" | "status">): Promise<SyncOperation> {
  const value: SyncOperation = {
    ...operation,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    attempts: 0,
    nextAttemptAt: new Date().toISOString(),
    status: "pending",
  };
  const db = await openSyncDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Unable to queue offline change."));
  });
  db.close();
  return value;
}

export async function listSyncOperations(): Promise<SyncOperation[]> {
  const db = await openSyncDb();
  const values = await new Promise<SyncOperation[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).index("createdAt").getAll();
    request.onsuccess = () => resolve(request.result.map(normalizeOperation));
    request.onerror = () => reject(request.error ?? new Error("Unable to read sync queue."));
  });
  db.close();
  return values;
}

function normalizeOperation(value: SyncOperation): SyncOperation {
  return {
    ...value,
    nextAttemptAt: value.nextAttemptAt ?? value.createdAt,
    status: value.status ?? "pending",
    attempts: value.attempts ?? 0,
  };
}

async function writeOperation(operation: SyncOperation): Promise<void> {
  const db = await openSyncDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(operation);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Unable to update sync queue."));
  });
  db.close();
}

async function removeSyncOperation(id: string): Promise<void> {
  const db = await openSyncDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Unable to remove synced operation."));
  });
  db.close();
}

function classifySyncError(error: unknown): { code: string; blocked: boolean } {
  const message = String((error as { message?: string })?.message ?? error);
  const code = String((error as { code?: string })?.code ?? "");
  const status = Number((error as { status?: number })?.status ?? 0);
  const lower = message.toLowerCase();
  const blocked = status === 401 || status === 403 || code === "42501" || lower.includes("jwt") || lower.includes("permission") || lower.includes("row-level security") || lower.includes("violates check constraint") || lower.includes("violates foreign key");
  return { code: code || String(status || "SYNC_ERROR"), blocked };
}

function retryDelay(attempts: number): number {
  const exponential = Math.min(MAX_RETRY_DELAY_MS, 2_000 * 2 ** Math.max(0, attempts - 1));
  return exponential + Math.floor(Math.random() * 1_000);
}

async function recordSyncFailure(operation: SyncOperation, error: unknown): Promise<void> {
  const classified = classifySyncError(error);
  const attempts = operation.attempts + 1;
  const blocked = classified.blocked || attempts >= MAX_AUTOMATIC_ATTEMPTS;
  const nextAttemptAt = new Date(Date.now() + retryDelay(attempts)).toISOString();
  await writeOperation({
    ...operation,
    attempts,
    status: blocked ? "blocked" : "failed",
    nextAttemptAt,
    lastError: String((error as { message?: string })?.message ?? error),
    lastErrorCode: classified.code,
  });
}

async function applyOperation(operation: SyncOperation): Promise<void> {
  const query = (supabase.from(operation.table) as any);
  const payload = operation.payload ? { ...operation.payload } : undefined;
  if (payload && operation.idempotencyKey && !payload.idempotency_key) payload.idempotency_key = operation.idempotencyKey;
  if (payload && operation.facilityId && !payload.facility_id) payload.facility_id = operation.facilityId;
  if (operation.type === "delete") {
    const { error } = await query.delete().eq("id", operation.recordId);
    if (error) throw error;
    return;
  }
  if (!payload) throw new Error(`Sync operation ${operation.id} has no payload.`);
  const { error } = await query.upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

export async function syncPendingOperations(): Promise<{ synced: number; pending: number; failed: number; blocked: number }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const summary = await getSyncQueueSummary();
    return { synced: 0, pending: summary.pending + summary.failed, failed: summary.failed, blocked: summary.blocked };
  }
  const operations = await listSyncOperations();
  let synced = 0;
  let failed = 0;
  let blocked = 0;
  const now = Date.now();
  for (const operation of operations) {
    if (operation.status === "blocked" || new Date(operation.nextAttemptAt).getTime() > now) {
      if (operation.status === "blocked") blocked += 1;
      continue;
    }
    try {
      await applyOperation(operation);
      await removeSyncOperation(operation.id);
      synced += 1;
    } catch (error) {
      await recordSyncFailure(operation, error);
      failed += 1;
    }
  }
  const summary = await getSyncQueueSummary();
  return { synced, pending: summary.pending, failed, blocked: summary.blocked };
}

export async function getPendingSyncCount(): Promise<number> {
  const summary = await getSyncQueueSummary();
  return summary.pending + summary.failed;
}

export async function getSyncQueueSummary(): Promise<SyncQueueSummary> {
  const operations = await listSyncOperations();
  return operations.reduce<SyncQueueSummary>((summary, operation) => {
    summary[operation.status] += 1;
    return summary;
  }, { pending: 0, failed: 0, blocked: 0 });
}
