import { canTransitionSettlementException, type SettlementException, type SettlementExceptionAuditEvent, type SettlementExceptionStatus } from '@/features/settlements/domain/settlement-exception-register';
import { getOfflineStorageKey, runOfflineTransaction } from './offline-store';

const exceptionEntity = 'settlement_exceptions' as const;
const auditEntity = 'settlement_exception_audit_events' as const;

export async function createSettlementException(input: Omit<SettlementException, 'id' | 'createdAt' | 'updatedAt'>, actorId: string): Promise<SettlementException> {
  const now = new Date().toISOString();
  const exception: SettlementException = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  const audit: SettlementExceptionAuditEvent = { id: crypto.randomUUID(), facilityId: input.facilityId, exceptionId: exception.id, action: 'created', actorId, occurredAt: now, beforeStatus: null, afterStatus: exception.status, details: exception.reason };
  return runOfflineTransaction('readwrite', (store, resolve, reject) => {
    const first = store.put({ ...exception, entity: exceptionEntity, storageKey: getOfflineStorageKey(exceptionEntity, exception.id), updatedAt: now });
    first.onerror = () => reject(first.error ?? new Error('Unable to save settlement exception.'));
    first.onsuccess = () => {
      const second = store.put({ ...audit, entity: auditEntity, storageKey: getOfflineStorageKey(auditEntity, audit.id), updatedAt: now });
      second.onerror = () => reject(second.error ?? new Error('Unable to save settlement exception audit event.'));
      second.onsuccess = () => resolve(exception);
    };
  });
}

export async function transitionSettlementException(input: { exception: SettlementException; nextStatus: SettlementExceptionStatus; actorId: string; resolution?: string | null; officerNotes?: string | null }): Promise<SettlementException> {
  const { exception, nextStatus, actorId } = input;
  if (!canTransitionSettlementException(exception.status, nextStatus)) throw new Error(`Invalid settlement exception transition: ${exception.status} → ${nextStatus}.`);
  if ((nextStatus === 'resolved' || nextStatus === 'waived') && !input.resolution?.trim()) throw new Error('Resolved or waived exceptions require a resolution note.');
  const now = new Date().toISOString();
  const updated: SettlementException = { ...exception, status: nextStatus, officerNotes: input.officerNotes ?? exception.officerNotes, resolution: input.resolution ?? exception.resolution, resolvedAt: nextStatus === 'resolved' || nextStatus === 'waived' ? now : exception.resolvedAt, resolvedBy: nextStatus === 'resolved' || nextStatus === 'waived' ? actorId : exception.resolvedBy, updatedAt: now };
  const audit: SettlementExceptionAuditEvent = { id: crypto.randomUUID(), facilityId: exception.facilityId, exceptionId: exception.id, action: nextStatus === 'resolved' ? 'resolved' : nextStatus === 'waived' ? 'waived' : 'status_changed', actorId, occurredAt: now, beforeStatus: exception.status, afterStatus: nextStatus, details: input.resolution?.trim() || input.officerNotes?.trim() || `Status changed to ${nextStatus}.` };
  return runOfflineTransaction('readwrite', (store, resolve, reject) => {
    const first = store.put({ ...updated, entity: exceptionEntity, storageKey: getOfflineStorageKey(exceptionEntity, updated.id), updatedAt: now });
    first.onerror = () => reject(first.error ?? new Error('Unable to update settlement exception.'));
    first.onsuccess = () => {
      const second = store.put({ ...audit, entity: auditEntity, storageKey: getOfflineStorageKey(auditEntity, audit.id), updatedAt: now });
      second.onerror = () => reject(second.error ?? new Error('Unable to save settlement exception audit event.'));
      second.onsuccess = () => resolve(updated);
    };
  });
}
