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

export async function listOfflineSettlementExceptions(): Promise<SettlementException[]> {
  return listOffline<SettlementException>("settlement_exceptions");
}

export async function createOfflineSettlementException(
  exception: Omit<SettlementException, "id">,
): Promise<SettlementException> {
  const id = crypto.randomUUID();
  const record: SettlementException = { ...exception, id };
  const audit: SettlementExceptionAuditEvent = {
    id: crypto.randomUUID(),
    facilityId: exception.facilityId,
    exceptionId: id,
    eventType: "created",
    actorId: null,
    occurredAt: exception.detectedAt,
    before: null,
    after: exception.status,
    note: null,
  };
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

export async function updateOfflineSettlementExceptionStatus(
  exceptionId: string,
  nextStatus: SettlementExceptionStatus,
  actorId: string,
  note?: string,
): Promise<SettlementException> {
  return runOfflineTransaction("readwrite", (store, resolve, reject) => {
    const request = store.get(`settlement_exceptions:${exceptionId}`);
    request.onerror = () => reject(request.error ?? new Error("Unable to read settlement exception."));
    request.onsuccess = () => {
      const existing = request.result as SettlementException | undefined;
      if (!existing) { reject(new Error("Settlement exception was not found.")); return; }
      if (!canChangeSettlementExceptionStatus(existing.status, nextStatus)) { reject(new Error(`Invalid exception transition: ${existing.status} → ${nextStatus}.`)); return; }
      if (nextStatus !== existing.status && !note?.trim()) { reject(new Error("A status change requires an audit note.")); return; }
      const now = new Date().toISOString();
      const updated: SettlementException = {
        ...existing,
        status: nextStatus,
        assignedTo: existing.assignedTo || actorId,
        resolutionNote: nextStatus === "resolved" || nextStatus === "waived" ? note!.trim() : existing.resolutionNote,
        resolvedAt: nextStatus === "resolved" || nextStatus === "waived" ? now : existing.resolvedAt,
        resolvedBy: nextStatus === "resolved" || nextStatus === "waived" ? actorId : existing.resolvedBy,
      };
      const save = store.put({ ...updated, entity: "settlement_exceptions", storageKey: `settlement_exceptions:${exceptionId}`, updatedAt: now });
      save.onerror = () => reject(save.error ?? new Error("Unable to update settlement exception."));
      save.onsuccess = () => {
        if (nextStatus === existing.status) { resolve(updated); return; }
        const audit: SettlementExceptionAuditEvent = {
          id: crypto.randomUUID(), facilityId: existing.facilityId, exceptionId, eventType: "status_changed", actorId,
          occurredAt: now, before: existing.status, after: nextStatus, note: note!.trim(),
        };
        const event = store.put({ ...audit, entity: "settlement_exception_audit_events", storageKey: `settlement_exception_audit_events:${audit.id}`, updatedAt: now });
        event.onerror = () => reject(event.error ?? new Error("Unable to save settlement exception audit event."));
        event.onsuccess = () => resolve(updated);
      };
    };
  });
}

export async function getOfflineSettlementException(exceptionId: string): Promise<SettlementException | undefined> {
  return getOffline<SettlementException>("settlement_exceptions", exceptionId);
}
