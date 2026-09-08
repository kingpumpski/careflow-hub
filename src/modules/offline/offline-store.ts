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

async function transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const request = work(tx.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline database operation failed."));
    tx.onabort = () => reject(tx.error ?? new Error("Offline database transaction aborted."));
  });
}

export async function putOffline<T extends OfflineRecord>(entity: OfflineEntity, record: T): Promise<T> {
  const now = new Date().toISOString();
  const value = { ...record, entity, updatedAt: now, createdAt: record.createdAt ?? now } as T & { entity: OfflineEntity };
  await transaction("readwrite", (store) => store.put(value));
  return value as T;
}

export async function putManyOffline<T extends OfflineRecord>(entity: OfflineEntity, records: T[]): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const now = new Date().toISOString();
    const values = records.map((record) => ({ ...record, entity, updatedAt: now, createdAt: record.createdAt ?? now }));
    values.forEach((value) => store.put(value));
    tx.oncomplete = () => resolve(values as T[]);
    tx.onerror = () => reject(tx.error ?? new Error("Offline bulk write failed."));
    tx.onabort = () => reject(tx.error ?? new Error("Offline bulk write aborted."));
  });
}

export async function listOffline<T extends OfflineRecord>(entity: OfflineEntity): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).index("entity").getAll(entity);
    request.onsuccess = () => resolve((request.result ?? []) as T[]);
    request.onerror = () => reject(request.error ?? new Error("Unable to read offline records."));
  });
}

export async function deleteOffline(entity: OfflineEntity, id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`Unable to delete ${entity} record.`));
  });
}

export async function clearOfflineEntity(entity: OfflineEntity): Promise<void> {
  const records = await listOffline(entity);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    records.forEach((record) => store.delete(record.id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Unable to clear offline records."));
  });
}
