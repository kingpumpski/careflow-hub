import { buildRequestNumber } from "@/modules/authorization/preauth-studio";
import { buildPreAuthDocumentPayload, type PreAuthReviewInput } from "@/modules/authorization/preauth-review";
import { getStoredFacilityId } from "@/features/preauth/services/preauthFacility.service";
import { enqueueSyncOperation } from "./sync-queue";
import { listOffline, runOfflineTransaction, getOfflineStorageKey } from "./offline-store";

export type OfflinePreAuthDraft = Record<string, unknown> & { id: string };

export type OfflinePreAuthFinalizeResult = {
  id: string;
  requestNumber: string;
  versionNumber: number;
  snapshot: Record<string, unknown>;
  submission: Record<string, unknown>;
};

const now = () => new Date().toISOString();
const makeDraftId = () => crypto.randomUUID();

function duplicateSignature(input: PreAuthReviewInput): string {
  return [input.patientId, input.membershipNumber.trim().toUpperCase(), input.procedureId, input.procedureDate, input.insurerId].join("|");
}

function itemRows(preauthId: string, input: PreAuthReviewInput, timestamp: string) {
  return input.items.filter((item) => item.description.trim()).map((item) => ({
    id: item.id,
    preauth_id: preauthId,
    description: item.description.trim(),
    quantity: Math.max(0, Number(item.quantity) || 0),
    unit_price: Math.max(0, Number(item.unitPrice) || 0),
    amount: Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unitPrice) || 0),
    category: item.category,
    createdAt: timestamp,
  }));
}

const stored = (entity: "preauthorizations" | "preauth_items" | "preauthorization_versions" | "preauthorization_submissions" | "preauthorization_audit_events", record: OfflinePreAuthDraft) => ({
  ...record,
  entity,
  storageKey: getOfflineStorageKey(entity, record.id),
});

async function queueMutation(table: string, type: "insert" | "update" | "delete", recordId: string, payload?: Record<string, unknown>, idempotencyKey?: string, actorId?: string | null) {
  await enqueueSyncOperation({
    table,
    type,
    recordId,
    facilityId: getStoredFacilityId() ?? undefined,
    actorId: actorId ?? undefined,
    idempotencyKey,
    payload,
  });
}

async function queuePreAuthRows(
  draft: OfflinePreAuthDraft,
  items: OfflinePreAuthDraft[],
  operation: "insert" | "update",
  actorId?: string | null,
  idempotencyPrefix?: string,
) {
  const facilityId = getStoredFacilityId();
  const draftPayload = Object.fromEntries(Object.entries(draft).filter(([key]) => !["entity", "storageKey"].includes(key)));
  if (facilityId && !draftPayload.facility_id) draftPayload.facility_id = facilityId;
  await queueMutation("pre_authorizations", operation, draft.id, draftPayload, idempotencyPrefix ? `${idempotencyPrefix}:preauth` : undefined, actorId);
  for (const item of items) {
    const payload = Object.fromEntries(Object.entries(item).filter(([key]) => !["entity", "storageKey"].includes(key)));
    if (facilityId && !payload.facility_id) payload.facility_id = facilityId;
    await queueMutation("preauth_items", "insert", item.id, payload, idempotencyPrefix ? `${idempotencyPrefix}:item:${item.id}` : undefined, actorId);
  }
}

export async function findOfflinePreAuthDuplicates(signature: string, excludeId?: string) {
  const records = await listOffline<OfflinePreAuthDraft>("preauthorizations");
  return records.filter((record) => record.duplicate_signature === signature && record.id !== excludeId && ["draft", "prepared"].includes(String(record.status ?? "draft")));
}

export async function createOfflinePreAuthDraft(reviewInput: PreAuthReviewInput, createdBy?: string | null): Promise<OfflinePreAuthDraft> {
  if (!reviewInput.patientId || !reviewInput.insurerId || !reviewInput.procedureId || !reviewInput.procedureDate) throw new Error("Patient, insurer, procedure, and procedure date are required.");

  const id = makeDraftId();
  const signature = duplicateSignature(reviewInput);
  const timestamp = now();
  const draft: OfflinePreAuthDraft = {
    id,
    patient_id: reviewInput.patientId,
    insurance_company_id: reviewInput.insurerId,
    doctor_id: reviewInput.doctorId || null,
    procedure_id: reviewInput.procedureId,
    procedure_date: reviewInput.procedureDate,
    diagnosis: reviewInput.diagnosis || null,
    total_cost: reviewInput.items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unitPrice) || 0), 0),
    provider_name: reviewInput.providerName,
    provider_address: reviewInput.providerAddress,
    provider_phone: reviewInput.providerPhone,
    status: "draft",
    current_state: "Draft",
    created_by: createdBy ?? null,
    client_company_name: reviewInput.companyName || reviewInput.insurerName || null,
    patient_phone: reviewInput.patientPhone || null,
    document_format: reviewInput.format,
    document_currency: reviewInput.currency,
    duplicate_signature: signature,
    clinical_notes: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const items = itemRows(id, reviewInput, timestamp);

  const result = await runOfflineTransaction<OfflinePreAuthDraft>("readwrite", (store, resolve, reject) => {
    const existingRequest = store.index("entity").getAll("preauthorizations");
    existingRequest.onerror = () => reject(existingRequest.error ?? new Error("Unable to check offline duplicate requests."));
    existingRequest.onsuccess = () => {
      const duplicate = (existingRequest.result as OfflinePreAuthDraft[]).some((record) => record.duplicate_signature === signature && ["draft", "prepared"].includes(String(record.status ?? "draft")));
      if (duplicate) { reject(new Error("A matching offline pre-authorization already exists.")); return; }

      const values = [stored("preauthorizations", draft), ...items.map((item) => stored("preauth_items", { ...item, id: item.id, updatedAt: timestamp }))];
      let remaining = values.length;
      values.forEach((value) => {
        const request = store.put(value);
        request.onerror = () => reject(request.error ?? new Error("Unable to save offline pre-authorization."));
        request.onsuccess = () => { remaining -= 1; if (remaining === 0) resolve(draft); };
      });
    };
  });

  await queuePreAuthRows(result, items.map((item) => ({ ...item, id: item.id, updatedAt: timestamp })), "insert", createdBy, `preauth:${result.id}:create`);
  return result;
}

export async function updateOfflinePreAuthDraft(preauthId: string, reviewInput: PreAuthReviewInput, doctorId?: string | null, notes?: string | null): Promise<OfflinePreAuthDraft> {
  const signature = duplicateSignature(reviewInput);
  const timestamp = now();

  const result = await runOfflineTransaction<OfflinePreAuthDraft>("readwrite", (store, resolve, reject) => {
    const draftRequest = store.get(getOfflineStorageKey("preauthorizations", preauthId));
    draftRequest.onerror = () => reject(draftRequest.error ?? new Error("Unable to read offline pre-authorization draft."));
    draftRequest.onsuccess = () => {
      const draft = draftRequest.result as OfflinePreAuthDraft | undefined;
      if (!draft || draft.entity !== "preauthorizations") { reject(new Error("Offline pre-authorization draft was not found.")); return; }
      if (draft.status === "submitted") { reject(new Error("A frozen pre-authorization cannot be edited.")); return; }

      const duplicateRequest = store.index("entity").getAll("preauthorizations");
      duplicateRequest.onerror = () => reject(duplicateRequest.error ?? new Error("Unable to check offline duplicate requests."));
      duplicateRequest.onsuccess = () => {
        const duplicate = (duplicateRequest.result as OfflinePreAuthDraft[]).some((record) => record.id !== preauthId && record.duplicate_signature === signature && ["draft", "prepared"].includes(String(record.status ?? "draft")));
        if (duplicate) { reject(new Error("A matching offline pre-authorization already exists.")); return; }

        const updated: OfflinePreAuthDraft = {
          ...draft,
          patient_id: reviewInput.patientId,
          insurance_company_id: reviewInput.insurerId,
          doctor_id: doctorId ?? reviewInput.doctorId ?? null,
          procedure_id: reviewInput.procedureId,
          procedure_date: reviewInput.procedureDate,
          diagnosis: reviewInput.diagnosis || null,
          total_cost: reviewInput.items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unitPrice) || 0), 0),
          provider_name: reviewInput.providerName,
          provider_address: reviewInput.providerAddress,
          provider_phone: reviewInput.providerPhone,
          client_company_name: reviewInput.companyName || reviewInput.insurerName || null,
          patient_phone: reviewInput.patientPhone || null,
          document_format: reviewInput.format,
          document_currency: reviewInput.currency,
          duplicate_signature: signature,
          clinical_notes: notes ?? draft.clinical_notes ?? null,
          updatedAt: timestamp,
        };
        const itemIdsRequest = store.index("entity").getAll("preauth_items");
        itemIdsRequest.onerror = () => reject(itemIdsRequest.error ?? new Error("Unable to read offline charge lines."));
        itemIdsRequest.onsuccess = () => {
          const oldItems = (itemIdsRequest.result as OfflinePreAuthDraft[]).filter((item) => item.preauth_id === preauthId);
          let pendingDeletes = oldItems.length;
          const saveItems = () => {
            const items = itemRows(preauthId, reviewInput, timestamp);
            const values = [stored("preauthorizations", updated), ...items.map((item) => stored("preauth_items", { ...item, id: item.id, updatedAt: timestamp }))];
            let remaining = values.length;
            values.forEach((value) => {
              const request = store.put(value);
              request.onerror = () => reject(request.error ?? new Error("Unable to update offline pre-authorization."));
              request.onsuccess = () => { remaining -= 1; if (remaining === 0) resolve(updated); };
            });
          };
          if (!pendingDeletes) { saveItems(); return; }
          oldItems.forEach((item) => {
            const request = store.delete(getOfflineStorageKey("preauth_items", item.id));
            request.onerror = () => reject(request.error ?? new Error("Unable to replace offline charge lines."));
            request.onsuccess = () => { pendingDeletes -= 1; if (pendingDeletes === 0) saveItems(); };
          });
        };
      };
    };
  });

  const currentItems = await listOffline<OfflinePreAuthDraft>("preauth_items");
  const newItems = currentItems.filter((item) => item.preauth_id === preauthId);
  const previousItems = currentItems.filter((item) => item.preauth_id === preauthId);
  await queuePreAuthRows(result, newItems, "update", undefined, `preauth:${preauthId}:update:${timestamp}`);
  for (const item of previousItems.filter((item) => !newItems.some((next) => next.id === item.id))) {
    await queueMutation("preauth_items", "delete", item.id, undefined, `preauth:${preauthId}:delete:${item.id}:${timestamp}`);
  }
  return result;
}

export async function finalizeOfflinePreAuth(preauthId: string, reviewInput: PreAuthReviewInput, doctorId: string | null | undefined, notes: string | null | undefined, recipientManifest: unknown, subject: string, messageBody: string): Promise<OfflinePreAuthFinalizeResult> {
  const requestNumber = buildRequestNumber(preauthId);
  const snapshot = buildPreAuthDocumentPayload(reviewInput, requestNumber);
  const totalCost = reviewInput.items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unitPrice) || 0), 0);
  const idempotencyKey = `${preauthId}:freeze:${requestNumber}`;

  const result = await runOfflineTransaction<OfflinePreAuthFinalizeResult>("readwrite", (store, resolve, reject) => {
    const draftRequest = store.get(getOfflineStorageKey("preauthorizations", preauthId));
    draftRequest.onerror = () => reject(draftRequest.error ?? new Error("Unable to read offline pre-authorization."));
    draftRequest.onsuccess = () => {
      const draft = draftRequest.result as OfflinePreAuthDraft | undefined;
      if (!draft || draft.entity !== "preauthorizations") { reject(new Error("Offline pre-authorization draft was not found.")); return; }

      const submissionsRequest = store.index("entity").getAll("preauthorization_submissions");
      submissionsRequest.onerror = () => reject(submissionsRequest.error ?? new Error("Unable to check offline handoff history."));
      submissionsRequest.onsuccess = () => {
        const existing = (submissionsRequest.result as OfflinePreAuthDraft[]).find((record) => record.preauth_id === preauthId && record.idempotency_key === idempotencyKey);
        if (existing) {
          resolve({ id: preauthId, requestNumber, versionNumber: Number(existing.version_number), snapshot: (existing.snapshot as Record<string, unknown>) ?? {}, submission: existing });
          return;
        }
        if (draft.status === "submitted") { reject(new Error("This offline pre-authorization has already been finalized with a different handoff key.")); return; }

        const versionsRequest = store.index("entity").getAll("preauthorization_versions");
        versionsRequest.onerror = () => reject(versionsRequest.error ?? new Error("Unable to read offline revisions."));
        versionsRequest.onsuccess = () => {
          const versions = versionsRequest.result as OfflinePreAuthDraft[];
          const versionNumber = versions.filter((record) => record.preauth_id === preauthId).reduce((max, record) => Math.max(max, Number(record.version_number) || 0), 0) + 1;
          const timestamp = now();
          const versionId = crypto.randomUUID();
          const submissionId = crypto.randomUUID();
          const version = stored("preauthorization_versions", { id: versionId, preauth_id: preauthId, version_number: versionNumber, snapshot, total_cost: totalCost, createdAt: timestamp, updatedAt: timestamp });
          const submission = stored("preauthorization_submissions", { id: submissionId, preauth_id: preauthId, version_id: versionId, version_number: versionNumber, status: "prepared", recipient_manifest: recipientManifest, attachment_manifest: [{ type: "attachment", filename: `${requestNumber}-v${versionNumber}.pdf`, mimeType: "application/pdf", sizeBytes: null, storagePath: null }], subject, message_body: messageBody, idempotency_key: idempotencyKey, createdAt: timestamp, updatedAt: timestamp });
          const updatedDraft = { ...draft, doctor_id: doctorId ?? reviewInput.doctorId ?? draft.doctor_id ?? null, clinical_notes: notes ?? draft.clinical_notes ?? null, status: "submitted", current_state: "Email handoff prepared", request_number: requestNumber, document_revision: versionNumber, document_payload: snapshot, document_finalized_at: timestamp, updatedAt: timestamp };
          const audit = stored("preauthorization_audit_events", { id: crypto.randomUUID(), preauth_id: preauthId, version_id: versionId, submission_id: submissionId, event_type: "email_handoff_prepared", event_data: { versionNumber, recipientCount: Array.isArray(recipientManifest) ? recipientManifest.length : 0, attachmentCount: 1 }, createdAt: timestamp, updatedAt: timestamp });
          const values = [version, submission, stored("preauthorizations", updatedDraft), audit];
          let remaining = values.length;
          values.forEach((value) => {
            const request = store.put(value);
            request.onerror = () => reject(request.error ?? new Error("Unable to finalize offline pre-authorization."));
            request.onsuccess = () => { remaining -= 1; if (remaining === 0) resolve({ id: preauthId, requestNumber, versionNumber, snapshot, submission }); };
          });
        };
      };
    };
  });

  const facilityId = getStoredFacilityId();
  const base = facilityId ? { facility_id: facilityId } : {};
  const actorId = doctorId ?? undefined;
  await queueMutation("pre_authorizations", "update", preauthId, { ...base, status: "submitted", current_state: "Email handoff prepared", request_number: result.requestNumber, document_revision: result.versionNumber, document_payload: result.snapshot, document_finalized_at: new Date().toISOString(), doctor_id: doctorId ?? reviewInput.doctorId ?? null, clinical_notes: notes ?? null }, idempotencyKey, actorId);
  await queueMutation("preauthorization_versions", "insert", String(result.snapshot.id ?? `${preauthId}:v${result.versionNumber}`), { ...base, ...result.snapshot, preauth_id: preauthId, version_number: result.versionNumber }, `${idempotencyKey}:version`, actorId);
  await queueMutation("preauthorization_submissions", "insert", String(result.submission.id), { ...base, ...result.submission }, idempotencyKey, actorId);
  await queueMutation("preauthorization_audit_events", "insert", String(result.submission.id), { ...base, preauth_id: preauthId, version_id: result.submission.version_id, submission_id: result.submission.id, event_type: "email_handoff_prepared", event_data: { versionNumber: result.versionNumber, recipientCount: Array.isArray(recipientManifest) ? recipientManifest.length : 0, attachmentCount: 1 }, createdAt: new Date().toISOString() }, `${idempotencyKey}:audit`, actorId);
  return result;
}
