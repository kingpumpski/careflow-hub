import { getStoredFacilityId } from "@/features/preauth/services/preauthFacility.service";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { getCareFlowDataMode } from "@/modules/offline/data-mode";

export type ClaimWorkflowType = "new_claim" | "rejected_claim";
export type ClaimEntryMode = "upload" | "manual";
export type ClaimDiagnosisEventMetadata = Record<string, Json | undefined>;

export interface ClaimDiagnosisRecommendation {
  code: string;
  version: "ICD-10" | "ICD-11";
  description: string;
  confidence: number;
  justification: string;
  sourceText: string;
}

export interface ClaimServiceItem {
  code: string;
  description: string;
  quantity: number;
  dateOfService: string;
  category: "CPT" | "HCPCS" | "Other";
  unitPrice?: number;
  amount?: number;
  source?: string;
}

export interface ClaimDocumentEntry {
  code: string;
  description: string;
  page?: number;
  line?: number;
  position: string;
}

export interface ClaimAnalysisResult {
  analysis_id: string;
  document_sha256: string;
  workflowType: ClaimWorkflowType;
  patient_name?: string;
  claim_number?: string;
  date_of_service?: string;
  original_diagnoses: ClaimDocumentEntry[];
  recommended_diagnoses: ClaimDiagnosisRecommendation[];
  service_items: ClaimServiceItem[];
  response_message?: string;
  clinical_summary?: string;
  rejection_reason?: string;
  compliance_flags: string[];
  extracted_confidence: number;
  fallback_warning?: string;
  warnings: string[];
}

export interface ManualClaimLine {
  id: string;
  code: string;
  description: string;
  tooth: string;
  eye: string;
  days: number;
  unit: string;
  quantity: number;
  unitPrice: number;
  flag: string;
  status: string;
  category: ClaimServiceItem["category"];
}

export interface ManualClaimInput {
  patient_name: string;
  claim_number: string;
  date_of_service: string;
  insurance_company_id: string;
  rejection_reason: string;
  clinical_notes: string;
  co_payment: number;
  authorization_code: string;
  comments: string[];
  service_items: ManualClaimLine[];
  original_diagnoses: Array<{ code: string; description: string }>;
}

export interface ClaimAnalysisRequest {
  workflow_type: ClaimWorkflowType;
  analysis_id: string;
  rejection_reason?: string;
  file?: File;
  manual_claim?: ManualClaimInput;
}

export interface ClaimCatalogItem {
  id: string;
  code: string;
  name: string;
  category: ClaimServiceItem["category"];
  unitPrice: number;
}

export function calculateClaimTotal(items: Array<Pick<ManualClaimLine, "quantity" | "unitPrice">>): number {
  return items.reduce((total, item) => {
    const quantity = Number.isFinite(item.quantity) ? Math.max(0, item.quantity) : 0;
    const unitPrice = Number.isFinite(item.unitPrice) ? Math.max(0, item.unitPrice) : 0;
    return total + quantity * unitPrice;
  }, 0);
}

function isClaimAnalysisResult(value: unknown): value is ClaimAnalysisResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  const isObject = (item: unknown): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item);
  const validDiagnoses = Array.isArray(result.original_diagnoses) && result.original_diagnoses.every((item) =>
    isObject(item) && typeof item.code === "string" && typeof item.description === "string" && typeof item.position === "string"
  );
  const validRecommendations = Array.isArray(result.recommended_diagnoses) && result.recommended_diagnoses.every((item) =>
    isObject(item)
    && typeof item.code === "string"
    && (item.version === "ICD-10" || item.version === "ICD-11")
    && typeof item.description === "string"
    && typeof item.confidence === "number"
    && item.confidence >= 0
    && item.confidence <= 100
    && typeof item.justification === "string"
    && typeof item.sourceText === "string"
  );
  const validServiceItems = Array.isArray(result.service_items) && result.service_items.every((item) =>
    isObject(item)
    && typeof item.code === "string"
    && typeof item.description === "string"
    && typeof item.quantity === "number"
    && item.quantity > 0
    && (item.category === "CPT" || item.category === "HCPCS" || item.category === "Other")
  );
  const validMessages = (items: unknown) => Array.isArray(items) && items.every((item) => typeof item === "string");

  return typeof result.analysis_id === "string"
    && typeof result.document_sha256 === "string"
    && /^[a-f0-9]{64}$/i.test(result.document_sha256)
    && (result.workflowType === "new_claim" || result.workflowType === "rejected_claim")
    && validDiagnoses
    && validRecommendations
    && validServiceItems
    && validMessages(result.compliance_flags)
    && validMessages(result.warnings)
    && typeof result.extracted_confidence === "number"
    && result.extracted_confidence >= 0
    && result.extracted_confidence <= 100
    && (result.response_message === undefined || typeof result.response_message === "string")
    && (result.clinical_summary === undefined || typeof result.clinical_summary === "string");
}

export function mapClaimCatalogItems(catalogRows: Array<Record<string, unknown>>, procedureRows: Array<Record<string, unknown>> = []): ClaimCatalogItem[] {
  const catalog = catalogRows
    .filter((row) => row.archived !== true)
    .map((row) => ({
      id: String(row.id),
      code: String(row.code ?? row.item_code ?? ""),
      name: String(row.item_name ?? row.name ?? ""),
      category: row.category === "CPT" || row.category === "HCPCS" ? row.category : "Other" as const,
      unitPrice: Number(row.unit_price ?? 0),
    }));

  const procedures = procedureRows.map((row) => ({
    id: String(row.id),
    code: String(row.procedure_code ?? ""),
    name: String(row.procedure_name ?? ""),
    category: row.category === "HCPCS" ? "HCPCS" as const : "CPT" as const,
    unitPrice: Number(row.default_tariff ?? 0),
  }));

  const merged = [...catalog, ...procedures].filter((item) => item.name.trim());
  return merged.filter((item, index) => merged.findIndex((entry) => entry.id === item.id) === index);
}

async function fileToDataUrl(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `data:${file.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

async function sha256(value: string | ArrayBuffer): Promise<string> {
  const input = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function analyzeClaim(request: ClaimAnalysisRequest): Promise<ClaimAnalysisResult> {
  let body: Record<string, unknown> = {
    workflow_type: request.workflow_type,
    analysis_id: request.analysis_id,
    rejection_reason: request.rejection_reason,
  };

  if (request.file) {
    if (request.file.size > 8 * 1024 * 1024) {
      throw new Error("Files are limited to 8 MB.");
    }
    const [dataUrl, documentHash] = await Promise.all([
      fileToDataUrl(request.file),
      sha256(await request.file.arrayBuffer()),
    ]);
    body = {
      ...body,
      file_name: request.file.name,
      mime_type: request.file.type || "application/octet-stream",
      data_url: dataUrl,
      document_sha256: documentHash,
    };
  } else if (request.manual_claim) {
    body = {
      ...body,
      manual_claim: request.manual_claim,
      document_sha256: await sha256(JSON.stringify(request.manual_claim)),
    };
  } else {
    throw new Error("Select a document or provide claim details before analyzing.");
  }

  const { data, error } = await supabase.functions.invoke("claim-diagnosis-analyze", { body });
  if (error) {
    const context = (error as Error & { context?: Response }).context;
    if (context) {
      const payload = await context.clone().json().catch(() => null) as { error?: string } | null;
      if (payload?.error) throw new Error(payload.error);
    }
    throw error;
  }
  if (!isClaimAnalysisResult(data)) {
    throw new Error("The claim analysis service returned an invalid response.");
  }
  return data;
}

export async function recordClaimDiagnosisEvent(
  analysisId: string,
  action: string,
  metadata: ClaimDiagnosisEventMetadata,
): Promise<void> {
  const { error } = await supabase.rpc("log_claim_diagnosis_event", {
    p_record_id: analysisId,
    p_action: action,
    p_metadata: metadata,
  });
  if (error) throw error;
}

export async function saveClaimDiagnosisDraft(
  input: ManualClaimInput,
  analysis: ClaimAnalysisResult,
  selectedCodes: ClaimDiagnosisRecommendation[],
): Promise<string> {
  if (getCareFlowDataMode() === "offline") {
    throw new Error("Connect to the database before saving a claim update draft.");
  }
  const facilityId = getStoredFacilityId();
  if (!facilityId) {
    throw new Error("Select a facility before saving a claim update draft.");
  }

  const total = calculateClaimTotal(input.service_items);
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(input.date_of_service)
    ? new Date(`${input.date_of_service}T00:00:00Z`)
    : null;
  const dateOfService = parsedDate && !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === input.date_of_service
    ? input.date_of_service
    : null;
  const { data, error } = await supabase
    .from("claim_diagnosis_drafts")
    .insert({
      facility_id: facilityId,
      workflow_type: analysis.workflowType,
      patient_name: input.patient_name.trim() || null,
      claim_number: input.claim_number.trim() || null,
      date_of_service: dateOfService,
      insurance_company_id: input.insurance_company_id || null,
      rejection_reason: input.rejection_reason.trim() || null,
      clinical_notes: input.clinical_notes.trim() || null,
      co_payment: input.co_payment,
      authorization_code: input.authorization_code.trim() || null,
      comments: input.comments,
      service_items: input.service_items,
      diagnoses: selectedCodes,
      response_message: analysis.response_message ?? null,
      total_amount: total,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) throw error;
  return String(data.id);
}

export function catalogItemToClaimLine(item: ClaimCatalogItem): ManualClaimLine {
  return {
    id: crypto.randomUUID(),
    code: item.code,
    description: item.name,
    tooth: "",
    eye: "",
    days: 1,
    unit: "Unit",
    quantity: 1,
    unitPrice: item.unitPrice,
    flag: "",
    status: "Pending",
    category: item.category,
  };
}

export function createClaimResponseDraft(
  analysis: ClaimAnalysisResult,
  rejectionReason: string,
): string {
  const diagnosisList = analysis.recommended_diagnoses.length
    ? analysis.recommended_diagnoses.map((item) => `${item.code} ${item.description}`).join("; ")
    : "No additional diagnosis recommendations met the confidence threshold.";
  const serviceList = analysis.service_items.length
    ? analysis.service_items.map((item) => `${item.code} ${item.description}`).join("; ")
    : "No service items could be confirmed from the supplied information.";
  const reasonSpecific = rejectionReason.toLowerCase().includes("missing secondary diagnosis")
    ? "The listed codes are recommendations only. Add a secondary diagnosis only when the complete medical record supports it."
    : rejectionReason.toLowerCase().includes("medical necessity")
      ? "Please verify that the documented findings support each billed service and satisfy the payer's applicable medical-necessity policy."
      : "Please review the supplied claim documentation against the payer's stated rejection criteria.";

  return [
    `Patient: ${analysis.patient_name || "Not provided"} | Claim: ${analysis.claim_number || "Not provided"} | Date of service: ${analysis.date_of_service || "Not provided"}`,
    `We respectfully request reconsideration of the claim rejected for ${rejectionReason || "the reason listed by the payer"}.`,
    `The supplied documentation references the following diagnoses for coding review: ${diagnosisList}. Clinical summary: ${analysis.clinical_summary || "Refer to the submitted documentation."}`,
    `The service items submitted for review are: ${serviceList}. ${reasonSpecific}`,
    "Please review the complete medical record and applicable payer policy before submission. We request reprocessing if the submitted documentation supports coverage.",
  ].join("\n\n");
}
