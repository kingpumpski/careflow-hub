/**
 * Pre-authorization studio domain rules.
 * Pure functions only: safe to reuse in UI, PDF generation, email drafting and tests.
 */

export type PreAuthDocumentFormat = "ghana" | "international";

export interface PreAuthStudioItem {
  id: string;
  category: "procedure" | "laboratory" | "drugs" | "accommodation" | "other";
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface PreAuthEmailInput {
  patientName: string;
  membershipNumber: string;
  procedureName: string;
  procedureDate: string;
  diagnosis?: string | null;
  insurerName: string;
  insurerContactPerson?: string | null;
  providerName: string;
  providerEmail?: string | null;
  officerName?: string | null;
  officerPosition?: string | null;
  officerPhone?: string | null;
  senderEmail?: string | null;
}

export interface PreAuthEmailDraft {
  subject: string;
  body: string;
  isFutureProcedure: boolean;
}

export function normaliseDateOnly(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function isFutureOrTodayProcedure(procedureDate: string, today = new Date()): boolean {
  const procedure = normaliseDateOnly(procedureDate);
  if (!procedure) return true;
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(`${procedure}T00:00:00`);
  return target.getTime() >= current.getTime();
}

export function formatProcedureDate(value: string, locale = "en-GB"): string {
  const normalised = normaliseDateOnly(value);
  if (!normalised) return "the date to be confirmed";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${normalised}T00:00:00`));
}

export function itemAmount(item: Pick<PreAuthStudioItem, "quantity" | "unitPrice">): number {
  return Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unitPrice) || 0);
}

export function totalItems(items: PreAuthStudioItem[]): number {
  return items.reduce((sum, item) => sum + itemAmount(item), 0);
}

export function buildDuplicateSignature(input: {
  patientId: string;
  membershipNumber: string;
  procedureId?: string | null;
  procedureDate: string;
  insurerId?: string | null;
}): string {
  return [
    input.patientId,
    input.membershipNumber.trim().toUpperCase(),
    input.procedureId || "",
    normaliseDateOnly(input.procedureDate),
    input.insurerId || "",
  ].join("|");
}

export function buildRequestNumber(id: string, createdAt = new Date()): string {
  const year = createdAt.getFullYear();
  return `PA-${year}-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function buildPreAuthEmail(input: PreAuthEmailInput, today = new Date()): PreAuthEmailDraft {
  const future = isFutureOrTodayProcedure(input.procedureDate, today);
  const date = formatProcedureDate(input.procedureDate);
  const greeting = input.insurerContactPerson?.trim()
    ? `Dear ${input.insurerContactPerson.trim()},`
    : "Dear Sir/Madam,";
  const diagnosis = input.diagnosis?.trim() || "noted in the attached request document";
  const action = future
    ? `is scheduled to undergo the ${input.procedureName} procedure on ${date}`
    : `underwent the ${input.procedureName} procedure on ${date}`;

  const subject = future
    ? `PRE-AUTHORIZATION REQUEST – ${input.patientName.toUpperCase()} – ${input.procedureName}`
    : `POST-PROCEDURE AUTHORIZATION DOCUMENTATION – ${input.patientName.toUpperCase()} – ${input.procedureName}`;

  const body = [
    greeting,
    "",
    future
      ? `We write to request pre-authorization for ${input.patientName}, whose membership number is ${input.membershipNumber || "not provided"}. The client ${action}.`
      : `We write regarding ${input.patientName}, whose membership number is ${input.membershipNumber || "not provided"}. The client ${action}. We are submitting the authorization documentation for your review and processing.`,
    "",
    `Procedure: ${input.procedureName}`,
    `Procedure date: ${date}`,
    `Membership number: ${input.membershipNumber || "Not provided"}`,
    `Diagnosis: ${diagnosis}`,
    "",
    future
      ? "Kindly review the attached pre-authorization request and advise on the approval/authorization requirements."
      : "Kindly review the attached documentation and advise on any additional information or authorization requirements needed for processing.",
    "",
    "Please do not hesitate to contact us should you require any clarification.",
    "",
    "Thank you.",
    "",
    input.officerName || "Claims Officer",
    input.officerPosition || "Claims Department",
    input.officerPhone || "",
    input.senderEmail || input.providerEmail || "",
    input.providerName,
  ].filter((line) => line !== undefined).join("\n");

  return { subject, body, isFutureProcedure: future };
}
