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

type StoredRecord = OfflineRecord & { storageKey: string; entity: OfflineEntity };

const DB_NAME = "careflow-internal";
const DB_VERSION = 2;
const STORE_NAME = "records";
const META_STORE = "metadata";

const storageKey = (entity: OfflineEntity, id: string) => `${entity}:${id}`;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB is unavailable in this browser.")); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Unable to open offline database."));
    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;
      if (tx && tx.objectStoreNames.contains(STORE_NAME)) {
        const oldStore = tx.objectStore(STORE_NAME);
        if (oldStore.keyPath === "id") {
          const records: StoredRecord[] = [];
          oldStore.openCursor().onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
              const value = cursor.value as OfflineRecord & { entity?: OfflineEntity };
              if (value.entity) records.push({ ...value, storageKey: storageKey(value.entity, value.id) });
              cursor.continue();
            } else {
              db.deleteObjectStore(STORE_NAME);
              const store = db.createObjectStore(STORE_NAME, { keyPath: "storageKey" });
              store.createIndex("entity", "entity", { unique: false });
              store.createIndex("entity_updated", ["entity", "updatedAt"], { unique: false });
              records.forEach((record) => store.put(record));
            }
          };
        }
      } else if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "storageKey" });
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
  const value: StoredRecord = { ...record, entity, storageKey: storageKey(entity, record.id), updatedAt: new Date().toISOString() };
  return runOfflineTransaction("readwrite", (store, resolve, reject) => {
    const request = store.put(value);
    request.onerror = () => reject(request.error ?? new Error(`Unable to save offline ${entity} record.`));
    request.onsuccess = () => resolve(record);
  });
}

export async function putManyOffline<T extends OfflineRecord>(entity: OfflineEntity, records: T[]): Promise<T[]> {
  return runOfflineTransaction("readwrite", (store, resolve, reject) => {
    const values: StoredRecord[] = records.map((record) => ({ ...record, entity, storageKey: storageKey(entity, record.id), updatedAt: new Date().toISOString() }));
    let remaining = values.length;
    if (!remaining) { resolve([]); return; }
    values.forEach((value) => {
      const request = store.put(value);
      request.onerror = () => reject(request.error ?? new Error(`Unable to save offline ${entity} record.`));
      request.onsuccess = () => { remaining -= 1; if (!remaining) resolve(records); };
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
    const request = store.get(storageKey(entity, id));
    request.onerror = () => reject(request.error ?? new Error(`Unable to read offline ${entity} record.`));
    request.onsuccess = () => resolve(request.result as T | undefined);
  });
}

export async function deleteOffline(entity: OfflineEntity, id: string): Promise<void> {
  return runOfflineTransaction("readwrite", (store, resolve, reject) => {
    const request = store.delete(storageKey(entity, id));
    request.onerror = () => reject(request.error ?? new Error(`Unable to delete offline ${entity} record.`));
    request.onsuccess = () => resolve(undefined);
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
