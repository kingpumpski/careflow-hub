import { getStoredFacilityId } from "@/features/preauth/services/preauthFacility.service";
import { canChangeSettlementExceptionStatus, type SettlementException, type SettlementExceptionStatus } from "@/features/settlements/domain/settlement-exceptions";
import { getOffline, listOffline, runOfflineTransaction, type OfflineRecord } from "./offline-store";

export type SettlementExceptionAuditEvent = OfflineRecord & {
  facilityId: string;
  exceptionId: string;
  eventType: "created" | "status_changed";
  actorId: string | null;
  occurredAt: string;
  before: SettlementExceptionStatus | null;
  after: SettlementExceptionStatus | null;
  note: string | null;
};

export async function listOfflineSettlementExceptions(facilityId = getStoredFacilityId()): Promise<SettlementException[]> {
  const rows = await listOffline<SettlementException>("settlement_exceptions");
  return facilityId ? rows.filter((row) => row.facilityId === facilityId) : [];
}

export async function createOfflineSettlementException(exception: Omit<SettlementException, "id">): Promise<SettlementException> {
  const facilityId = getStoredFacilityId();
  if (!facilityId || facilityId !== exception.facilityId) throw new Error("Facility context does not match the settlement exception.");
  const id = crypto.randomUUID();
  const record: SettlementException = { ...exception, id };
  const audit: SettlementExceptionAuditEvent = { id: crypto.randomUUID(), facilityId: exception.facilityId, exceptionId: id, eventType: "created", actorId: null, occurredAt: exception.detectedAt, before: null, after: exception.status, note: null };
  return runOfflineTransaction("readwrite", (store, resolve, reject) => {
    const save = store.put({ ...record, entity: "settlement_exceptions", storageKey: `settlement_exceptions:${id}`, updatedAt: new Date().toISOString() });
    save.onerror = () => reject(save.error ?? new Error("Unable to save settlement exception."));
    save.onsuccess = () => {
      const event = store.put({ ...audit, entity: "settlement_exception_audit_events", storageKey: `settlement_exception_audit_events:${audit.id}`, updatedAt: new Date().toISOString() });
      event.onerror = () => reject(event.error ?? new Error("Unable to save settlement exception audit event."));
      event.onsuccess = () => resolve(record);
    };
  });
}

export async function updateOfflineSettlementExceptionStatus(exceptionId: string, nextStatus: SettlementExceptionStatus, actorId: string, note?: string): Promise<SettlementException> {
  const facilityId = getStoredFacilityId();
  if (!facilityId) throw new Error("Facility context is required before updating a settlement exception.");
  return runOfflineTransaction("readwrite", (store, resolve, reject) => {
    const request = store.get(`settlement_exceptions:${exceptionId}`);
    request.onerror = () => reject(request.error ?? new Error("Unable to read settlement exception."));
    request.onsuccess = () => {
      const existing = request.result as SettlementException | undefined;
      if (!existing) { reject(new Error("Settlement exception was not found.")); return; }
      if (existing.facilityId !== facilityId) { reject(new Error("The settlement exception belongs to another facility.")); return; }
      if (!canChangeSettlementExceptionStatus(existing.status, nextStatus)) { reject(new Error(`Invalid exception transition: ${existing.status} → ${nextStatus}.`)); return; }
      if (nextStatus !== existing.status && !note?.trim()) { reject(new Error("A status change requires an audit note.")); return; }
      const now = new Date().toISOString();
      const terminal = nextStatus === "resolved" || nextStatus === "waived";
      const updated: SettlementException = { ...existing, status: nextStatus, assignedTo: existing.assignedTo || actorId, resolutionNote: terminal ? note!.trim() : existing.resolutionNote, resolvedAt: terminal ? now : existing.resolvedAt, resolvedBy: terminal ? actorId : existing.resolvedBy };
      const save = store.put({ ...updated, entity: "settlement_exceptions", storageKey: `settlement_exceptions:${exceptionId}`, updatedAt: now });
      save.onerror = () => reject(save.error ?? new Error("Unable to update settlement exception."));
      save.onsuccess = () => {
        if (nextStatus === existing.status) { resolve(updated); return; }
        const audit: SettlementExceptionAuditEvent = { id: crypto.randomUUID(), facilityId: existing.facilityId, exceptionId, eventType: "status_changed", actorId, occurredAt: now, before: existing.status, after: nextStatus, note: note!.trim() };
        const event = store.put({ ...audit, entity: "settlement_exception_audit_events", storageKey: `settlement_exception_audit_events:${audit.id}`, updatedAt: now });
        event.onerror = () => reject(event.error ?? new Error("Unable to save settlement exception audit event."));
        event.onsuccess = () => resolve(updated);
      };
    };
  });
}

export async function getOfflineSettlementException(exceptionId: string): Promise<SettlementException | undefined> {
  const row = await getOffline<SettlementException>("settlement_exceptions", exceptionId);
  const facilityId = getStoredFacilityId();
  return row && facilityId === row.facilityId ? row : undefined;
}
