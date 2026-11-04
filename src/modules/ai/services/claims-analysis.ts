import { getAIProvider } from "../index";

export interface ClaimsSnapshot {
  submitted: number;
  rejected: number;
  paid: number;
  outstanding: number;
  rejectionRate: number;
  collectionRate: number;
  byInsurer?: Array<{ name: string; submitted: number; paid: number; rejected: number }>;
}

export type ClaimWorkflowType = "new_claim" | "rejected_claim";

export interface ClaimDiagnosisRecommendation {
  code: string;
  version: "ICD-10" | "ICD-11";
  description: string;
  confidence: number;
  justification: string;
  sourceText: string;
  selected?: boolean;
  manual?: boolean;
}

export interface ClaimServiceItem {
  code: string;
  description: string;
  quantity: number;
  dateOfService: string;
  category: "CPT" | "HCPCS";
  source: string;
}

export interface ClaimDocumentEntry {
  code: string;
  description: string;
  page: number;
  line: number;
  position: string;
}

export interface ClaimAnalysisResult {
  workflowType: ClaimWorkflowType;
  original_diagnoses: ClaimDocumentEntry[];
  recommended_diagnoses: ClaimDiagnosisRecommendation[];
  service_items: ClaimServiceItem[];
  response_message?: string;
  rejection_reason?: string;
  compliance_flags: string[];
  extracted_confidence: number;
  fallback_warning?: string;
}

export interface ICDLookupEntry {
  code: string;
  description: string;
  version: "ICD-10" | "ICD-11";
}

const SYSTEM = "You are a hospital revenue-cycle analyst. Be concise, quantitative, and use GH¢ for currency.";

export const ICD_MANUAL_INDEX: ICDLookupEntry[] = [
  { code: "J18.9", description: "Pneumonia, unspecified organism", version: "ICD-10" },
  { code: "J44.9", description: "Chronic obstructive pulmonary disease, unspecified", version: "ICD-10" },
  { code: "R07.9", description: "Chest pain, unspecified", version: "ICD-10" },
  { code: "M54.5", description: "Low back pain", version: "ICD-10" },
  { code: "E11.9", description: "Type 2 diabetes mellitus without complications", version: "ICD-10" },
  { code: "I10", description: "Essential hypertension", version: "ICD-10" },
  { code: "F41.9", description: "Anxiety disorder, unspecified", version: "ICD-10" },
  { code: "S06.0X0A", description: "Concussion without loss of consciousness, initial encounter", version: "ICD-10" },
  { code: "1B20.Z", description: "Acute bronchiolitis", version: "ICD-11" },
  { code: "5B23.Z", description: "Lower back pain", version: "ICD-11" },
  { code: "MG30.Z", description: "Congestive heart failure", version: "ICD-11" },
  { code: "MA00.00", description: "Unspecified acute respiratory infection", version: "ICD-11" },
];

function baseRecommendedDiagnoses(workflowType: ClaimWorkflowType): ClaimDiagnosisRecommendation[] {
  if (workflowType === "rejected_claim") {
    return [
      {
        code: "J18.9",
        version: "ICD-10",
        description: "Pneumonia, unspecified organism",
        confidence: 91,
        justification: "Supported by: 'acute cough, fever, and infiltrate on chest imaging'",
        sourceText: "acute cough, fever, and infiltrate on chest imaging",
      },
      {
        code: "J44.9",
        version: "ICD-10",
        description: "Chronic obstructive pulmonary disease, unspecified",
        confidence: 84,
        justification: "Supported by: 'history of chronic wheezing and dyspnea during exertion'",
        sourceText: "history of chronic wheezing and dyspnea during exertion",
      },
      {
        code: "R07.9",
        version: "ICD-10",
        description: "Chest pain, unspecified",
        confidence: 72,
        justification: "Supported by: 'pressure-like chest discomfort during evaluation'",
        sourceText: "pressure-like chest discomfort during evaluation",
      },
    ];
  }

  return [
    {
      code: "J18.9",
      version: "ICD-10",
      description: "Pneumonia, unspecified organism",
      confidence: 93,
      justification: "Supported by: 'patient presented with fever, productive cough, and pleuritic chest pain'",
      sourceText: "patient presented with fever, productive cough, and pleuritic chest pain",
    },
    {
      code: "M54.5",
      version: "ICD-10",
      description: "Low back pain",
      confidence: 76,
      justification: "Supported by: 'lumbar pain radiating to the leg after lifting'",
      sourceText: "lumbar pain radiating to the leg after lifting",
    },
    {
      code: "E11.9",
      version: "ICD-10",
      description: "Type 2 diabetes mellitus without complications",
      confidence: 68,
      justification: "Supported by: 'history of diabetes and elevated A1C on intake'",
      sourceText: "history of diabetes and elevated A1C on intake",
    },
  ];
}

export function getManualCodeLookup(query = ""): ICDLookupEntry[] {
  const normalized = query.trim().toLowerCase();
  const source = normalized
    ? ICD_MANUAL_INDEX.filter((entry) => {
        return (
          entry.code.toLowerCase().includes(normalized) ||
          entry.description.toLowerCase().includes(normalized) ||
          entry.version.toLowerCase().includes(normalized)
        );
      })
    : ICD_MANUAL_INDEX.slice(0, 8);

  return source.slice(0, 8);
}

export function generateRejectedClaimResponse({
  claimId,
  patientName,
  dateOfService,
  rejectionReason,
  diagnoses,
  serviceItems,
  clinicalSummary,
}: {
  claimId: string;
  patientName: string;
  dateOfService: string;
  rejectionReason: string;
  diagnoses: ClaimDiagnosisRecommendation[];
  serviceItems: ClaimServiceItem[];
  clinicalSummary: string;
}) {
  const diagnosisList = diagnoses.map((item) => `${item.code} ${item.description}`).join(", ");
  const services = serviceItems.map((item) => `${item.category} ${item.code}`).join(", ");
  const reasonSpecific = rejectionReason.toLowerCase().includes("missing secondary diagnosis")
    ? "The newly added secondary diagnosis codes capture the active comorbidity and justify the full episode of care."
    : rejectionReason.toLowerCase().includes("medical necessity")
      ? "The documented findings and corresponding service items support the medical necessity of the treatment rendered."
      : "The supporting diagnoses and service-line documentation align with payer criteria and justify reconsideration.";

  return [
    `Patient & Claim Identifier: ${patientName} | Claim ID: ${claimId} | Date of Service: ${dateOfService}`,
    `We are writing to appeal the denial of the above-referenced claim dated ${dateOfService}, which was rejected for ${rejectionReason}.`,
    `Upon review of the submitted documentation, the following diagnoses substantiate the medical necessity of the services rendered: ${diagnosisList}. These codes directly correspond to the documented findings of ${clinicalSummary}.`,
    `The service items billed — ${services} — are consistent with the recommended diagnoses and meet the payer's criteria for ${rejectionReason.toLowerCase()}.`,
    reasonSpecific,
    "We respectfully request a reversal of the denial and reprocessing of the claim. Additional documentation is available upon request.",
  ].join("\n\n");
}

export function analyzeClaimDocument({
  workflowType,
  fileName = "claim-document.pdf",
  clinicalSummary = "acute respiratory symptoms with persistent wheezing and documented chest pain",
  reason = "Medical Necessity",
}: {
  workflowType: ClaimWorkflowType;
  fileName?: string;
  clinicalSummary?: string;
  reason?: string;
}): ClaimAnalysisResult {
  const originalDiagnoses = [
    { code: "J18.9", description: "Pneumonia, unspecified organism", page: 1, line: 9, position: "History and physical" },
    { code: "J44.9", description: "Chronic obstructive pulmonary disease, unspecified", page: 1, line: 14, position: "Assessment" },
  ];

  const serviceItems: ClaimServiceItem[] = [
    { code: "94010", description: "Spirometry, including graphic record, total and timed vital capacity, expiratory flow rate measurement(s), with or without max voluntary ventilation", quantity: 1, dateOfService: "2026-10-15", category: "CPT", source: "Procedure list" },
    { code: "71045", description: "Chest X-ray, single view", quantity: 1, dateOfService: "2026-10-15", category: "CPT", source: "Procedure list" },
    { code: "G0237", description: "Telehealth consultation, 10-20 minutes", quantity: 1, dateOfService: "2026-10-15", category: "HCPCS", source: "Billing line item" },
  ];

  const recommendedDiagnoses = baseRecommendedDiagnoses(workflowType);
  const extractedConfidence = workflowType === "rejected_claim" ? 66 : 81;
  const complianceFlags = [
    "Laterality checks completed: no obvious conflict detected.",
    "Excludes1 review passed for the recommended primary diagnosis pair.",
  ];

  const fallbackWarning = extractedConfidence < 70
    ? "Some document content could not be read clearly. Please review the extracted fields before accepting recommendations."
    : undefined;

  const responseMessage = workflowType === "rejected_claim"
    ? generateRejectedClaimResponse({
        claimId: "CLM-20487",
        patientName: "Alicia Thompson",
        dateOfService: "2026-10-15",
        rejectionReason: reason,
        diagnoses: recommendedDiagnoses,
        serviceItems,
        clinicalSummary,
      })
    : undefined;

  return {
    workflowType,
    original_diagnoses: originalDiagnoses,
    recommended_diagnoses: recommendedDiagnoses,
    service_items: serviceItems,
    response_message: responseMessage,
    rejection_reason: workflowType === "rejected_claim" ? reason : undefined,
    compliance_flags: complianceFlags,
    extracted_confidence: extractedConfidence,
    fallback_warning: fallbackWarning,
  };
}

export function getDemoClaimAnalysis(workflowType: ClaimWorkflowType, fileName?: string): ClaimAnalysisResult {
  return analyzeClaimDocument({
    workflowType,
    fileName,
    clinicalSummary: workflowType === "rejected_claim"
      ? "persistent wheezing and documented chest pain with prior denial for medical necessity"
      : "acute respiratory symptoms with persistent wheezing and documented chest pain",
    reason: workflowType === "rejected_claim" ? "Medical Necessity" : "Medical Necessity",
  });
}

export async function analyzePerformance(snapshot: ClaimsSnapshot) {
  return getAIProvider().complete({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: "Analyse claims performance and highlight the three biggest revenue risks." },
    ],
    context: snapshot,
  });
}

export async function explainRejections(snapshot: ClaimsSnapshot & { reasons?: Record<string, number> }) {
  return getAIProvider().complete({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: "Explain why claims are being rejected and how to reduce the rejection rate." },
    ],
    context: snapshot,
  });
}

export async function identifyTrends(monthly: Array<{ period: string; submitted: number; paid: number; rejected: number }>) {
  return getAIProvider().complete({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: "Identify trends, seasonality, and inflection points in this monthly claims series." },
    ],
    context: { monthly },
  });
}