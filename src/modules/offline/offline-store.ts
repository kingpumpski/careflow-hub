export type OfflineEntity =
  | "preauthorizations"
  | "preauth_items"
  | "patients"
  | "insurance_companies"
  | "doctors"
  | "procedures"
  | "preauth_insurer_tariffs"
  | "preauthorization_versions"
  | "preauthorization_submissions"
  | "preauthorization_audit_events";

export type OfflineRecord = Record<string, unknown> & { id: string };

const DB_NAME = "careflow-internal";
const DB_VERSION = 1;
const STORE_NAME = "records";
const META_STORE = "metadata";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable in this browser."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Unable to open offline database."));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("entity", "entity", { unique: false });
        store.createIndex("entity_updated", ["entity", "updatedAt"], { unique: false });
      }
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * Execute a complete IndexedDB transaction. The callback must initiate its
 * first request synchronously; subsequent requests may be queued from request
 * success handlers, which keeps the transaction alive without Promise gaps.
 */
export async function runOfflineTransaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore, resolve: (value: T) => void, reject: (error: unknown) => void) => void,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    let result: T | undefined;
    let settled = false;
    let workError: unknown;

    const finish = (value: T) => {
      result = value;
      settled = true;
    };
    const fail = (error: unknown) => {
      workError = error;
      try { tx.abort(); } catch { /* transaction may already be complete */ }
    };

    try {
      work(store, finish, fail);
    } catch (error) {
      fail(error);
    }

    tx.oncomplete = () => {
      db.close();
      if (workError) reject(workError);
      else if (settled) resolve(result as T);
      else reject(new Error("Offline transaction completed without a result."));
    };
    tx.onerror = () => {
      db.close();
      reject(workError ?? tx.error ?? new Error("Offline database transaction failed."));
    };
    tx.onabort = () => {
      db.close();
      reject(workError ?? tx.error ?? new Error("Offline database transaction aborted."));
    };
  });
}

async function transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return runOfflineTransaction<T>(mode, (store, resolve, reject) => {
    const request = work(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline database operation failed."));
  });
}

export async function putOffline<T extends OfflineRecord>(entity: OfflineEntity, record: T): Promise<T> {
  const now = new Date().toISOString();
  const value = { ...record, entity, updatedAt: now, createdAt: record.createdAt ?? now } as T & { entity: OfflineEntity };
  await transaction("readwrite", (store) => store.put(value));
  return value as T;
}

export async function putManyOffline<T extends OfflineRecord>(entity: OfflineEntity, records: T[]): Promise<T[]> {
  return runOfflineTransaction<T[]>("readwrite", (store, resolve, reject) => {
    const now = new Date().toISOString();
    const values = records.map((record) => ({ ...record, entity, updatedAt: now, createdAt: record.createdAt ?? now }));
    let remaining = values.length;
    if (!remaining) {
      resolve([]);
      return;
    }
    values.forEach((value) => {
      const request = store.put(value);
      request.onerror = () => reject(request.error ?? new Error("Offline bulk write failed."));
      request.onsuccess = () => {
        remaining -= 1;
        if (remaining === 0) resolve(values as T[]);
      };
    });
  });
}

export async function listOffline<T extends OfflineRecord>(entity: OfflineEntity): Promise<T[]> {
  return transaction<T[]>("readonly", (store) => store.index("entity").getAll(entity));
}

export async function getOffline<T extends OfflineRecord>(entity: OfflineEntity, id: string): Promise<T | null> {
  const record = await transaction<T | undefined>("readonly", (store) => store.get(id));
  if (!record || record.entity !== entity) return null;
  return record as T;
}

export async function deleteOffline(entity: OfflineEntity, id: string): Promise<void> {
  await runOfflineTransaction<void>("readwrite", (store, resolve, reject) => {
    const lookup = store.get(id);
    lookup.onerror = () => reject(lookup.error ?? new Error(`Unable to delete ${entity} record.`));
    lookup.onsuccess = () => {
      if (lookup.result && lookup.result.entity !== entity) {
        reject(new Error(`Cannot delete ${id}: entity mismatch.`));
        return;
      }
      const request = store.delete(id);
      request.onerror = () => reject(request.error ?? new Error(`Unable to delete ${entity} record.`));
      request.onsuccess = () => resolve();
    };
  });
}

export async function clearOfflineEntity(entity: OfflineEntity): Promise<void> {
  await runOfflineTransaction<void>("readwrite", (store, resolve, reject) => {
    const request = store.index("entity").getAllKeys(entity);
    request.onerror = () => reject(request.error ?? new Error("Unable to clear offline records."));
    request.onsuccess = () => {
      const keys = request.result;
      let remaining = keys.length;
      if (!remaining) {
        resolve();
        return;
      }
      keys.forEach((key) => {
        const deletion = store.delete(key);
        deletion.onerror = () => reject(deletion.error ?? new Error("Unable to clear offline records."));
        deletion.onsuccess = () => {
          remaining -= 1;
          if (remaining === 0) resolve();
        };
      });
    };
  });
}
