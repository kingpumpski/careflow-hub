import { buildPreAuthDocumentPayload, type PreAuthReviewInput } from "./preauth-review";

export interface PreAuthRecipient {
  type: "to" | "cc";
  email: string;
  name?: string | null;
}

export interface PreAuthAttachment {
  type: "pdf" | "supporting_document";
  name: string;
  mimeType: string;
  sizeBytes?: number | null;
  storagePath?: string | null;
}

export interface PreAuthSubmissionPackage {
  snapshot: ReturnType<typeof buildPreAuthDocumentPayload>;
  idempotencyKey: string;
  recipients: PreAuthRecipient[];
  attachments: PreAuthAttachment[];
  subject: string;
  messageBody: string;
}

const normalize = (value: string) => value.trim().toLowerCase();

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
    if (!normalized || seen.has(normalized)) return;
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
  return {
    snapshot: buildPreAuthDocumentPayload(input.reviewInput, input.requestNumber),
    idempotencyKey: buildPreAuthIdempotencyKey(input.preauthId, input.versionNumber),
    recipients: buildPreAuthRecipientManifest({
      insurerEmail: input.insurerEmail,
      insurerName: input.insurerName,
      additionalEmails: input.additionalEmails,
      ccEmails: input.ccEmails,
    }),
    attachments: buildPreAuthAttachmentManifest(input.requestNumber, input.versionNumber),
    subject: input.subject,
    messageBody: input.messageBody,
  };
}
