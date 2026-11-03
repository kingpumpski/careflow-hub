import { supabase } from "@/integrations/supabase/client";
import { getStoredFacilityId } from "@/features/preauth/services/preauthFacility.service";
import { putManyOffline, putOffline, type OfflineEntity } from "./offline-store";

export type SyncOperationType = "insert" | "update" | "delete" | "rpc";
export type SyncOperationStatus = "pending" | "failed" | "blocked";

export interface SyncOperation {
  id: string;
  table: string;
  type: SyncOperationType;
  recordId: string;
  rpcName?: string;
  rpcArgs?: Record<string, unknown>;
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

export interface SyncQueueSummary { pending: number; failed: number; blocked: number; }

const DB_NAME = "careflow-sync-queue";
const DB_VERSION = 3;
const STORE_NAME = "operations";
const MAX_RETRY_DELAY_MS = 15 * 60_000;
const MAX_AUTOMATIC_ATTEMPTS = 8;

const OFFLINE_PULL_TABLES: Array<{ table: string; entity: OfflineEntity }> = [
  { table: "insurance_companies", entity: "insurance_companies" },
  { table: "doctors", entity: "doctors" },
  { table: "procedures", entity: "procedures" },
  { table: "diagnosis_codes", entity: "diagnosis_codes" },
  { table: "preauth_catalog_items", entity: "preauth_catalog_items" },
  { table: "patients", entity: "patients" },
  { table: "pre_authorizations", entity: "preauthorizations" },
  { table: "preauth_items", entity: "preauth_items" },
  { table: "claims_settlement_periods", entity: "claims_settlement_periods" },
  { table: "settlement_exceptions", entity: "settlement_exceptions" },
  { table: "settlement_exception_audit_events", entity: "settlement_exception_audit_events" },
];

function entityForTable(table: string): OfflineEntity | undefined {
  return OFFLINE_PULL_TABLES.find((mapping) => mapping.table === table)?.entity;
}

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
  const value: SyncOperation = { ...operation, id: crypto.randomUUID(), createdAt: new Date().toISOString(), attempts: 0, nextAttemptAt: new Date().toISOString(), status: "pending" };
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
  return { ...value, nextAttemptAt: value.nextAttemptAt ?? value.createdAt, status: value.status ?? "pending", attempts: value.attempts ?? 0 };
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

function classifySyncError(error: unknown): { code: string; blocked: boolean; conflict: boolean } {
  const message = String((error as { message?: string })?.message ?? error);
  const code = String((error as { code?: string })?.code ?? "");
  const status = Number((error as { status?: number })?.status ?? 0);
  const lower = message.toLowerCase();
  const conflict = lower.includes("sync_conflict:");
  const blocked = conflict || status === 401 || status === 403 || code === "42501" || lower.includes("jwt") || lower.includes("permission") || lower.includes("row-level security") || lower.includes("violates check constraint") || lower.includes("violates foreign key");
  return { code: code || (conflict ? "SYNC_CONFLICT" : String(status || "SYNC_ERROR")), blocked, conflict };
}

function retryDelay(attempts: number): number {
  const exponential = Math.min(MAX_RETRY_DELAY_MS, 2_000 * 2 ** Math.max(0, attempts - 1));
  return exponential + Math.floor(Math.random() * 1_000);
}

async function restoreConflictedDelete(operation: SyncOperation): Promise<void> {
  if (operation.type !== "delete" || !operation.payload || typeof operation.payload.id !== "string") return;
  const entity = entityForTable(operation.table);
  if (!entity) return;
  await putOffline(entity, operation.payload as Record<string, unknown> & { id: string });
}

async function recordSyncFailure(operation: SyncOperation, error: unknown): Promise<void> {
  const classified = classifySyncError(error);
  const attempts = operation.attempts + 1;
  const blocked = classified.blocked || attempts >= MAX_AUTOMATIC_ATTEMPTS;
  if (classified.conflict) await restoreConflictedDelete(operation);
  await writeOperation({ ...operation, attempts, status: blocked ? "blocked" : "failed", nextAttemptAt: new Date(Date.now() + retryDelay(attempts)).toISOString(), lastError: String((error as { message?: string })?.message ?? error), lastErrorCode: classified.code });
}

export function toSupabaseSyncPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...payload };
  delete normalized.entity;
  delete normalized.storageKey;
  delete normalized.baseVersion;
  if (Object.prototype.hasOwnProperty.call(normalized, "createdAt")) {
    if (!Object.prototype.hasOwnProperty.call(normalized, "created_at")) normalized.created_at = normalized.createdAt;
    delete normalized.createdAt;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "updatedAt")) {
    if (!Object.prototype.hasOwnProperty.call(normalized, "updated_at")) normalized.updated_at = normalized.updatedAt;
    delete normalized.updatedAt;
  }
  return normalized;
}

function withBaseVersion<T extends { eq: (column: string, value: string | number) => T }>(query: T, operation: SyncOperation): T {
  if (operation.baseVersion === undefined || operation.baseVersion === null) return query;
  return query.eq("updated_at", operation.baseVersion);
}

async function applyOperation(operation: SyncOperation): Promise<void> {
  if (operation.type === "rpc") {
    if (!operation.rpcName) throw new Error(`Sync operation ${operation.id} has no RPC name.`);
    const { error } = await (supabase as any).rpc(operation.rpcName, operation.rpcArgs ?? {});
    if (error) throw error;
    return;
  }
  const query = (supabase as any).from(operation.table);
  const payload = operation.payload ? toSupabaseSyncPayload(operation.payload) : undefined;
  if (payload && operation.idempotencyKey && !payload.idempotency_key) payload.idempotency_key = operation.idempotencyKey;
  if (payload && operation.facilityId && !payload.facility_id) payload.facility_id = operation.facilityId;
  if (operation.type === "delete") {
    const guardedQuery = withBaseVersion(query.delete().eq("id", operation.recordId), operation);
    const { data, error } = await guardedQuery.select("id").maybeSingle();
    if (error) throw error;
    if (operation.baseVersion !== undefined && !data) throw new Error(`SYNC_CONFLICT: record ${operation.table}/${operation.recordId} changed or is outside the current facility scope.`);
    return;
  }
  if (!payload) throw new Error(`Sync operation ${operation.id} has no payload.`);
  if (operation.type === "update") {
    const guardedQuery = withBaseVersion(query.update(payload).eq("id", operation.recordId), operation);
    const { data, error } = await guardedQuery.select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`SYNC_CONFLICT: record ${operation.table}/${operation.recordId} changed, no longer exists, or is outside the current facility scope.`);
    return;
  }
  await query.upsert(payload, { onConflict: "id" });
}

export async function pullSupabaseDataToOffline(): Promise<{ tables: number; records: number; skipped: number }> {
  const operations = await listSyncOperations();
  let tables = 0;
  let records = 0;
  let skipped = 0;
  for (const mapping of OFFLINE_PULL_TABLES) {
    const { data, error } = await ((supabase as any).from(mapping.table)).select("*");
    if (error) throw error;
    const facilityId = getStoredFacilityId();
    const rows = ((data ?? []) as Record<string, unknown>[])
      .filter((row) => typeof row.id === "string")
      .filter((row) => !facilityId || !Object.prototype.hasOwnProperty.call(row, "facility_id") || row.facility_id === facilityId);
    const safeRows = rows.filter((row) => {
      const changed = operations.some((queued) => queued.table === mapping.table && queued.recordId === row.id && queued.status !== "blocked");
      if (changed) skipped += 1;
      return !changed;
    });
    if (safeRows.length) {
      await putManyOffline(mapping.entity, safeRows as Array<Record<string, unknown> & { id: string }>);
      records += safeRows.length;
    }
    tables += 1;
  }
  return { tables, records, skipped };
}

export async function syncPendingOperations(): Promise<{ synced: number; pending: number; failed: number; blocked: number }> {
  const summary = await getSyncQueueSummary();
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { synced: 0, pending: summary.pending + summary.failed, failed: summary.failed, blocked: summary.blocked };
  }

  // Never attempt to replay or hydrate Supabase data before a real authenticated
  // session exists. During app startup the offline user can briefly coexist with
  // a reachable network, which previously caused 403/400 REST noise and retries.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
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
  try { await pullSupabaseDataToOffline(); } catch { /* best-effort hydration; durable mutations remain queued */ }
  const finalSummary = await getSyncQueueSummary();
  return { synced, pending: finalSummary.pending, failed, blocked: finalSummary.blocked };
}

export async function getPendingSyncCount(): Promise<number> {
  const summary = await getSyncQueueSummary();
  return summary.pending + summary.failed;
}

export async function getSyncQueueSummary(): Promise<SyncQueueSummary> {
  const operations = await listSyncOperations();
  return operations.reduce<SyncQueueSummary>((summary, operation) => { summary[operation.status] += 1; return summary; }, { pending: 0, failed: 0, blocked: 0 });
}

export async function getSyncConflicts(): Promise<SyncOperation[]> {
  const operations = await listSyncOperations();
  return operations.filter((operation) => operation.status === "blocked" && operation.lastErrorCode === "SYNC_CONFLICT");
}

/**
 * Safely abandons a blocked conflict and refreshes local state from the server.
 * This is intentionally destructive to the local mutation only; it never overwrites
 * the server with the stale offline payload.
 */
export async function discardSyncConflict(operationId: string): Promise<void> {
  const operation = (await getSyncConflicts()).find((candidate) => candidate.id === operationId);
  if (!operation) throw new Error("The sync conflict no longer exists.");
  await removeSyncOperation(operation.id);
  try {
    await pullSupabaseDataToOffline();
  } catch (error) {
    await writeOperation(operation);
    throw error;
  }
}
