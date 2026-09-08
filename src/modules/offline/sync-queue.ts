import { supabase } from "@/integrations/supabase/client";

export type SyncOperationType = "insert" | "update" | "delete";

export interface SyncOperation {
  id: string;
  table: string;
  type: SyncOperationType;
  recordId: string;
  payload?: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

const DB_NAME = "careflow-sync-queue";
const DB_VERSION = 1;
const STORE_NAME = "operations";

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
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

export async function enqueueSyncOperation(operation: Omit<SyncOperation, "id" | "createdAt" | "attempts">): Promise<SyncOperation> {
  const value: SyncOperation = { ...operation, id: crypto.randomUUID(), createdAt: new Date().toISOString(), attempts: 0 };
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
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to read sync queue."));
  });
  db.close();
  return values;
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

async function recordSyncFailure(operation: SyncOperation, error: unknown): Promise<void> {
  const db = await openSyncDb();
  const next: SyncOperation = { ...operation, attempts: operation.attempts + 1, lastError: String((error as { message?: string })?.message ?? error) };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(next);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Unable to record sync failure."));
  });
  db.close();
}

async function applyOperation(operation: SyncOperation): Promise<void> {
  const query = (supabase.from(operation.table) as any);
  if (operation.type === "delete") {
    const { error } = await query.delete().eq("id", operation.recordId);
    if (error) throw error;
    return;
  }
  if (!operation.payload) throw new Error(`Sync operation ${operation.id} has no payload.`);
  const { error } = await query.upsert(operation.payload, { onConflict: "id" });
  if (error) throw error;
}

export async function syncPendingOperations(): Promise<{ synced: number; pending: number; failed: number }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { synced: 0, pending: (await listSyncOperations()).length, failed: 0 };
  const operations = await listSyncOperations();
  let synced = 0;
  let failed = 0;
  for (const operation of operations) {
    try {
      await applyOperation(operation);
      await removeSyncOperation(operation.id);
      synced += 1;
    } catch (error) {
      await recordSyncFailure(operation, error);
      failed += 1;
    }
  }
  return { synced, pending: Math.max(0, operations.length - synced), failed };
}

export async function getPendingSyncCount(): Promise<number> {
  return (await listSyncOperations()).length;
}
