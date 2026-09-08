export type OfflineEntity =
  | "preauthorizations"
  | "preauth_items"
  | "patients"
  | "insurance_companies"
  | "doctors"
  | "procedures"
  | "diagnosis_codes"
  | "preauth_catalog_items"
  | "system_settings"
  | "preauth_insurer_tariffs"
  | "preauthorization_versions"
  | "preauthorization_submissions"
  | "preauthorization_audit_events"
  | "claims_settlement_periods";

export type OfflineRecord = Record<string, unknown> & { id: string };

const DB_NAME = "careflow-internal";
const DB_VERSION = 1;
const STORE_NAME = "records";
const META_STORE = "metadata";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB is unavailable in this browser.")); return; }
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
    const finish = (value: T) => { result = value; settled = true; };
    const fail = (error: unknown) => { workError = error; try { tx.abort(); } catch { /* transaction may already be complete */ } };
    try { work(store, finish, fail); } catch (error) { fail(error); }
    tx.oncomplete = () => { db.close(); if (workError) reject(workError); else if (settled) resolve(result as T); else reject(new Error("Offline transaction completed without a result.")); };
    tx.onerror = () => { db.close(); reject(workError ?? tx.error ?? new Error("Offline database transaction failed.")); };
    tx.onabort = () => { db.close(); reject(workError ?? tx.error ?? new Error("Offline database transaction aborted.")); };
  });
}

export async function putOffline<T extends OfflineRecord>(entity: OfflineEntity, record: T): Promise<T> {
  const value = { ...record, entity, updatedAt: new Date().toISOString() };
  return runOfflineTransaction("readwrite", (store, resolve, reject) => {
    const request = store.put(value);
    request.onerror = () => reject(request.error ?? new Error(`Unable to save offline ${entity} record.`));
    request.onsuccess = () => resolve(value as T);
  });
}

export async function putManyOffline<T extends OfflineRecord>(entity: OfflineEntity, records: T[]): Promise<T[]> {
  return runOfflineTransaction("readwrite", (store, resolve, reject) => {
    const values = records.map((record) => ({ ...record, entity, updatedAt: new Date().toISOString() }));
    let remaining = values.length;
    if (!remaining) { resolve([]); return; }
    values.forEach((value) => {
      const request = store.put(value);
      request.onerror = () => reject(request.error ?? new Error(`Unable to save offline ${entity} record.`));
      request.onsuccess = () => { remaining -= 1; if (!remaining) resolve(values as T[]); };
    });
  });
}

export async function listOffline<T extends OfflineRecord>(entity: OfflineEntity): Promise<T[]> {
  return runOfflineTransaction("readonly", (store, resolve, reject) => {
    const request = store.index("entity").getAll(entity);
    request.onerror = () => reject(request.error ?? new Error(`Unable to read offline ${entity} records.`));
    request.onsuccess = () => resolve(request.result as T[]);
  });
}

export async function getOffline<T extends OfflineRecord>(entity: OfflineEntity, id: string): Promise<T | undefined> {
  return runOfflineTransaction("readonly", (store, resolve, reject) => {
    const request = store.get(id);
    request.onerror = () => reject(request.error ?? new Error(`Unable to read offline ${entity} record.`));
    request.onsuccess = () => { const value = request.result as T | undefined; resolve(value?.entity === entity ? value : undefined); };
  });
}

export async function deleteOffline(entity: OfflineEntity, id: string): Promise<void> {
  return runOfflineTransaction("readwrite", (store, resolve, reject) => {
    const existing = store.get(id);
    existing.onerror = () => reject(existing.error ?? new Error(`Unable to read offline ${entity} record.`));
    existing.onsuccess = () => {
      if (!existing.result || existing.result.entity !== entity) { resolve(undefined); return; }
      const request = store.delete(id);
      request.onerror = () => reject(request.error ?? new Error(`Unable to delete offline ${entity} record.`));
      request.onsuccess = () => resolve(undefined);
    };
  });
}

export async function clearOfflineEntity(entity: OfflineEntity): Promise<void> {
  return runOfflineTransaction("readwrite", (store, resolve, reject) => {
    const request = store.index("entity").getAllKeys(entity);
    request.onerror = () => reject(request.error ?? new Error(`Unable to clear offline ${entity} records.`));
    request.onsuccess = () => {
      const keys = request.result;
      let remaining = keys.length;
      if (!remaining) { resolve(undefined); return; }
      keys.forEach((key) => {
        const deletion = store.delete(key);
        deletion.onerror = () => reject(deletion.error ?? new Error(`Unable to clear offline ${entity} records.`));
        deletion.onsuccess = () => { remaining -= 1; if (!remaining) resolve(undefined); };
      });
    };
  });
}
