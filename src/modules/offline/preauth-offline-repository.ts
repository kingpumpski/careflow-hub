import { buildRequestNumber } from "@/modules/authorization/preauth-studio";
import { buildPreAuthDocumentPayload, type PreAuthReviewInput } from "@/modules/authorization/preauth-review";
import { buildPreAuthDuplicateSignature } from "@/modules/authorization/preauth-integrity";
import { listOffline, putManyOffline, putOffline } from "./offline-store";

export type OfflinePreAuthDraft = Record<string, unknown> & { id: string };

export type OfflinePreAuthFinalizeResult = {
  id: string;
  requestNumber: string;
  versionNumber: number;
  snapshot: Record<string, unknown>;
  submission: Record<string, unknown>;
};

const now = () => new Date().toISOString();

function makeDraftId(): string {
  return crypto.randomUUID();
}

export async function findOfflinePreAuthDuplicates(signature: string, excludeId?: string) {
  const records = await listOffline<OfflinePreAuthDraft>("preauthorizations");
  return records.filter((record) => record.duplicate_signature === signature && record.id !== excludeId && ["draft", "prepared"].includes(String(record.status ?? "draft")));
}

/**
 * Local draft persistence. Excel is deliberately not involved in the write path;
 * IndexedDB is the operational store and Excel is only a backup/transfer format.
 */
export async function createOfflinePreAuthDraft(
  reviewInput: PreAuthReviewInput,
  createdBy?: string | null,
): Promise<OfflinePreAuthDraft> {
  if (!reviewInput.patientId || !reviewInput.insurerId || !reviewInput.procedureId || !reviewInput.procedureDate) {
    throw new Error("Patient, insurer, procedure, and procedure date are required.");
  }

  const id = makeDraftId();
  const signature = buildPreAuthDuplicateSignature(reviewInput);
  const duplicates = await findOfflinePreAuthDuplicates(signature);
  if (duplicates.length) throw new Error("A matching offline pre-authorization already exists.");

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

  const items = reviewInput.items
    .filter((item) => item.description.trim())
    .map((item) => ({
      id: item.id,
      preauth_id: id,
      description: item.description.trim(),
      quantity: Math.max(0, Number(item.quantity) || 0),
      unit_price: Math.max(0, Number(item.unitPrice) || 0),
      amount: Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unitPrice) || 0),
      category: item.category,
      createdAt: timestamp,
    }));

  await putOffline("preauthorizations", draft);
  if (items.length) await putManyOffline("preauth_items", items);
  return draft;
}

/**
 * Finalization is intentionally revision based: the snapshot is frozen before the
 * email/PDF handoff and is never rebuilt from mutable form state afterwards.
 */
export async function finalizeOfflinePreAuth(
  preauthId: string,
  reviewInput: PreAuthReviewInput,
  recipientManifest: unknown,
  subject: string,
  messageBody: string,
): Promise<OfflinePreAuthFinalizeResult> {
  const drafts = await listOffline<OfflinePreAuthDraft>("preauthorizations");
  const draft = drafts.find((record) => record.id === preauthId);
  if (!draft) throw new Error("Offline pre-authorization draft was not found.");
  if (draft.status === "submitted") throw new Error("This offline pre-authorization has already been finalized.");

  const requestNumber = buildRequestNumber(preauthId);
  const snapshot = buildPreAuthDocumentPayload(reviewInput, requestNumber);
  const existingVersions = await listOffline<OfflinePreAuthDraft>("preauthorization_versions");
  const versionNumber = existingVersions
    .filter((record) => record.preauth_id === preauthId)
    .reduce((max, record) => Math.max(max, Number(record.version_number) || 0), 0) + 1;
  const timestamp = now();

  const version = {
    id: crypto.randomUUID(),
    preauth_id: preauthId,
    version_number: versionNumber,
    snapshot,
    total_cost: reviewInput.items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unitPrice) || 0), 0),
    createdAt: timestamp,
  };

  const submission = {
    id: crypto.randomUUID(),
    preauth_id: preauthId,
    version_id: version.id,
    version_number: versionNumber,
    status: "prepared",
    recipient_manifest: recipientManifest,
    attachment_manifest: [{
      type: "attachment",
      filename: `${requestNumber}-v${versionNumber}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: null,
      storagePath: null,
    }],
    subject,
    message_body: messageBody,
    idempotency_key: `${preauthId}:freeze:${requestNumber}`,
    createdAt: timestamp,
  };

  await putOffline("preauthorization_versions", version);
  await putOffline("preauthorization_submissions", submission);
  await putOffline("preauthorizations", {
    ...draft,
    status: "submitted",
    current_state: "Email handoff prepared",
    request_number: requestNumber,
    document_revision: versionNumber,
    document_payload: snapshot,
    document_finalized_at: timestamp,
  });
  await putOffline("preauthorization_audit_events", {
    id: crypto.randomUUID(),
    preauth_id: preauthId,
    event_type: "handoff_prepared",
    version_number: versionNumber,
    createdAt: timestamp,
  });

  return { id: preauthId, requestNumber, versionNumber, snapshot, submission };
}
