import { buildPreAuthDocumentPayload, type PreAuthFrozenSnapshot, type PreAuthReviewInput } from "./preauth-review";

export interface PreAuthRecipient {
  type: "to" | "cc";
  email: string;
  name?: string | null;
}

export interface PreAuthAttachment {
  type: "pdf";
  name: string;
  mimeType: "application/pdf";
  sizeBytes?: number | null;
  storagePath?: null;
}

export interface PreAuthSubmissionPackage {
  snapshot: PreAuthFrozenSnapshot;
  idempotencyKey: string;
  recipients: PreAuthRecipient[];
  attachments: PreAuthAttachment[];
  subject: string;
  messageBody: string;
}

const normalize = (value: string) => value.trim().toLowerCase();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function buildPreAuthIdempotencyKey(preauthId: string, versionNumber: number) {
  return `${preauthId}:v${versionNumber}`;
}

export function buildPreAuthRecipientManifest(input: {
  insurerEmail?: string | null;
  insurerName?: string | null;
  additionalEmails?: string[] | null;
  ccEmails?: string[] | null;
}): PreAuthRecipient[] {
  const recipients: PreAuthRecipient[] = [];
  const seen = new Set<string>();
  const add = (type: "to" | "cc", email: string, name?: string | null) => {
    const normalized = normalize(email);
    if (!normalized || !emailPattern.test(normalized) || seen.has(normalized)) return;
    seen.add(normalized);
    recipients.push({ type, email: normalized, name: name?.trim() || null });
  };

  if (input.insurerEmail) add("to", input.insurerEmail, input.insurerName);
  for (const email of input.additionalEmails || []) add("cc", email);
  for (const email of input.ccEmails || []) add("cc", email);
  return recipients;
}

export function buildPreAuthAttachmentManifest(requestNumber: string, versionNumber: number): PreAuthAttachment[] {
  return [{
    type: "pdf",
    name: `${requestNumber}-v${versionNumber}.pdf`,
    mimeType: "application/pdf",
    sizeBytes: null,
    storagePath: null,
  }];
}

export function buildPreAuthSubmissionPackage(input: {
  preauthId: string;
  versionNumber: number;
  requestNumber: string;
  reviewInput: PreAuthReviewInput;
  subject: string;
  messageBody: string;
  insurerEmail?: string | null;
  insurerName?: string | null;
  additionalEmails?: string[] | null;
  ccEmails?: string[] | null;
}): PreAuthSubmissionPackage {
  return buildPreAuthSubmissionPackageFromSnapshot({
    preauthId: input.preauthId,
    versionNumber: input.versionNumber,
    requestNumber: input.requestNumber,
    snapshot: buildPreAuthDocumentPayload(input.reviewInput, input.requestNumber),
    subject: input.subject,
    messageBody: input.messageBody,
    insurerEmail: input.insurerEmail,
    insurerName: input.insurerName,
    additionalEmails: input.additionalEmails,
    ccEmails: input.ccEmails,
  });
}

/**
 * Canonical finalisation path: once a snapshot is frozen, downstream PDF/email
 * artifacts must be built from that snapshot rather than mutable UI state.
 */
export function buildPreAuthSubmissionPackageFromSnapshot(input: {
  preauthId: string;
  versionNumber: number;
  requestNumber: string;
  snapshot: PreAuthFrozenSnapshot;
  subject: string;
  messageBody: string;
  insurerEmail?: string | null;
  insurerName?: string | null;
  additionalEmails?: string[] | null;
  ccEmails?: string[] | null;
}): PreAuthSubmissionPackage {
  const recipients = buildPreAuthRecipientManifest({
    insurerEmail: input.insurerEmail,
    insurerName: input.insurerName,
    additionalEmails: input.additionalEmails,
    ccEmails: input.ccEmails,
  });

  return {
    snapshot: input.snapshot,
    idempotencyKey: buildPreAuthIdempotencyKey(input.preauthId, input.versionNumber),
    recipients,
    attachments: buildPreAuthAttachmentManifest(input.requestNumber, input.versionNumber),
    subject: input.subject.trim(),
    messageBody: input.messageBody,
  };
}
