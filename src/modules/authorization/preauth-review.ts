import { itemAmount, totalItems, type PreAuthStudioItem } from "./preauth-studio";

export interface PreAuthReviewInput {
  patientId: string;
  patientName: string;
  membershipNumber: string;
  insurerId: string;
  insurerName: string;
  procedureId: string;
  procedureName: string;
  procedureDate: string;
  diagnosis?: string | null;
  doctorName?: string | null;
  patientPhone?: string | null;
  companyName?: string | null;
  insurerEmail?: string | null;
  providerEmail?: string | null;
  currency: string;
  format: "ghana" | "international";
  items: PreAuthStudioItem[];
}

export interface PreAuthReviewIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface PreAuthReviewResult {
  ready: boolean;
  errors: PreAuthReviewIssue[];
  warnings: PreAuthReviewIssue[];
  total: number;
  itemCount: number;
}

const issue = (field: string, message: string, severity: PreAuthReviewIssue["severity"]): PreAuthReviewIssue => ({
  field,
  message,
  severity,
});

export function validatePreAuthReview(input: PreAuthReviewInput): PreAuthReviewResult {
  const errors: PreAuthReviewIssue[] = [];
  const warnings: PreAuthReviewIssue[] = [];

  if (!input.patientId.trim() || !input.patientName.trim()) errors.push(issue("patient", "Select a patient/client before submission.", "error"));
  if (!input.membershipNumber.trim()) warnings.push(issue("membershipNumber", "Membership number is missing; confirm that the insurer can process the request without it.", "warning"));
  if (!input.insurerId.trim() || !input.insurerName.trim()) errors.push(issue("insurer", "Select an active insurance partner.", "error"));
  if (!input.procedureId.trim() || !input.procedureName.trim()) errors.push(issue("procedure", "Select the requested procedure.", "error"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.procedureDate)) errors.push(issue("procedureDate", "A valid procedure date is required.", "error"));
  if (!input.currency.trim()) errors.push(issue("currency", "Currency is required.", "error"));

  const billableItems = input.items.filter((item) => item.description.trim());
  if (!billableItems.length) errors.push(issue("items", "Add at least one charge line before submission.", "error"));

  input.items.forEach((item, index) => {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    if (!item.description.trim() && (quantity > 0 || unitPrice > 0)) {
      errors.push(issue(`items.${index}`, "A charge line with an amount must have a description.", "error"));
    }
    if (item.description.trim() && (!Number.isFinite(quantity) || quantity <= 0)) {
      errors.push(issue(`items.${index}.quantity`, "Quantity must be greater than zero.", "error"));
    }
    if (item.description.trim() && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
      errors.push(issue(`items.${index}.unitPrice`, "Unit price cannot be negative.", "error"));
    }
  });

  if (!input.doctorName?.trim()) warnings.push(issue("doctor", "Doctor/provider has not been selected.", "warning"));
  if (!input.diagnosis?.trim()) warnings.push(issue("diagnosis", "Diagnosis has not been selected.", "warning"));
  if (!input.patientPhone?.trim()) warnings.push(issue("patientPhone", "Patient telephone is missing.", "warning"));
  if (!input.insurerEmail?.trim()) errors.push(issue("insurerEmail", "The selected insurer does not have a submission email address.", "error"));
  if (!input.providerEmail?.trim()) warnings.push(issue("providerEmail", "A provider claims email is not configured.", "warning"));

  const total = totalItems(billableItems);
  if (total <= 0) errors.push(issue("total", "The request total must be greater than zero.", "error"));

  return {
    ready: errors.length === 0,
    errors,
    warnings,
    total,
    itemCount: billableItems.length,
  };
}

/** Builds a deterministic business snapshot for the frozen revision, PDF and email handoff. */
export function buildPreAuthDocumentPayload(input: PreAuthReviewInput, requestNumber?: string) {
  const items = input.items
    .filter((item) => item.description.trim())
    .map((item) => ({
      category: item.category,
      description: item.description.trim(),
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      amount: itemAmount(item),
    }));

  return {
    schemaVersion: 1,
    requestNumber: requestNumber || null,
    patient: {
      id: input.patientId,
      name: input.patientName.trim(),
      membershipNumber: input.membershipNumber.trim(),
      phone: input.patientPhone?.trim() || null,
      companyName: input.companyName?.trim() || null,
    },
    insurer: {
      id: input.insurerId,
      name: input.insurerName.trim(),
      email: input.insurerEmail?.trim() || null,
    },
    clinical: {
      procedureId: input.procedureId,
      procedureName: input.procedureName.trim(),
      procedureDate: input.procedureDate,
      diagnosis: input.diagnosis?.trim() || null,
      doctorName: input.doctorName?.trim() || null,
    },
    document: {
      format: input.format,
      currency: input.currency.trim(),
      items,
      total: items.reduce((sum, item) => sum + item.amount, 0),
    },
  };
}
