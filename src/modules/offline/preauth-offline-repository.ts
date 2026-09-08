import { buildRequestNumber } from "@/modules/authorization/preauth-studio";
import { buildPreAuthDocumentPayload, type PreAuthReviewInput } from "@/modules/authorization/preauth-review";
import { listOffline, runOfflineTransaction } from "./offline-store";

export type OfflinePreAuthDraft = Record<string, unknown> & { id: string };

export type OfflinePreAuthFinalizeResult = {
  id: string;
  requestNumber: string;
  versionNumber: number;
  snapshot: Record<string, unknown>;
  submission: Record<string, unknown>;
};

const now = () => new Date().toISOString();

function makeDraftId(): string { return crypto.randomUUID(); }

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
    doctor_id: null,
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
    createdAt: timestamp,
  };
  const items = itemRows(id, reviewInput, timestamp);

  return runOfflineTransaction<OfflinePreAuthDraft>("readwrite", (store, resolve, reject) => {
    const existingRequest = store.index("entity").getAll("preauthorizations");
    existingRequest.onerror = () => reject(existingRequest.error ?? new Error("Unable to check offline duplicate requests."));
    existingRequest.onsuccess = () => {
      const duplicate = (existingRequest.result as OfflinePreAuthDraft[]).some((record) => record.duplicate_signature === signature && ["draft", "prepared"].includes(String(record.status ?? "draft")));
      if (duplicate) { reject(new Error("A matching offline pre-authorization already exists.")); return; }

      const values = [draft, ...items.map((item) => ({ ...item, entity: "preauth_items" as const, updatedAt: timestamp }))].map((record) => ({
        ...record,
        entity: record.entity ?? "preauthorizations",
        updatedAt: record.updatedAt ?? timestamp,
        createdAt: record.createdAt ?? timestamp,
      }));
      let remaining = values.length;
      values.forEach((value) => {
        const request = store.put(value);
        request.onerror = () => reject(request.error ?? new Error("Unable to save offline pre-authorization."));
        request.onsuccess = () => { remaining -= 1; if (remaining === 0) resolve(draft); };
      });
    };
  });
}

export async function finalizeOfflinePreAuth(preauthId: string, reviewInput: PreAuthReviewInput, recipientManifest: unknown, subject: string, messageBody: string): Promise<OfflinePreAuthFinalizeResult> {
  const requestNumber = buildRequestNumber(preauthId);
  const snapshot = buildPreAuthDocumentPayload(reviewInput, requestNumber);
  const totalCost = reviewInput.items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unitPrice) || 0), 0);
  const idempotencyKey = `${preauthId}:freeze:${requestNumber}`;

  return runOfflineTransaction<OfflinePreAuthFinalizeResult>("readwrite", (store, resolve, reject) => {
    const draftRequest = store.get(preauthId);
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
          const version = { id: versionId, entity: "preauthorization_versions" as const, preauth_id: preauthId, version_number: versionNumber, snapshot, total_cost: totalCost, createdAt: timestamp, updatedAt: timestamp };
          const submission = { id: submissionId, entity: "preauthorization_submissions" as const, preauth_id: preauthId, version_id: versionId, version_number: versionNumber, status: "prepared", recipient_manifest: recipientManifest, attachment_manifest: [{ type: "attachment", filename: `${requestNumber}-v${versionNumber}.pdf`, mimeType: "application/pdf", sizeBytes: null, storagePath: null }], subject, message_body: messageBody, idempotency_key: idempotencyKey, createdAt: timestamp, updatedAt: timestamp };
          const updatedDraft = { ...draft, status: "submitted", current_state: "Email handoff prepared", request_number: requestNumber, document_revision: versionNumber, document_payload: snapshot, document_finalized_at: timestamp, updatedAt: timestamp };
          const audit = { id: crypto.randomUUID(), entity: "preauthorization_audit_events" as const, preauth_id: preauthId, version_id: versionId, submission_id: submissionId, event_type: "email_handoff_prepared", event_data: { versionNumber, recipientCount: Array.isArray(recipientManifest) ? recipientManifest.length : 0, attachmentCount: 1 }, createdAt: timestamp, updatedAt: timestamp };
          const values = [version, submission, updatedDraft, audit];
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
}
