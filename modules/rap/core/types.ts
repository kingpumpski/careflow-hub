export type RapSupportType = "REQUIRED" | "SUPPORTING";
export type RapMatchStatus = "MATCHED" | "UNRESOLVED";

export interface RapDiagnosisCandidate {
  code: string;
  description: string;
  supportType: RapSupportType;
  confidence: number;
  specificity: number;
  recencyScore: number;
  partnerPrecedence: number;
  provisional?: boolean;
  confirmed?: boolean;
  priorEpisode?: boolean;
}

export interface RapKnowledgeBaseEntry {
  id: string;
  diagnosisCode: string;
  costItemCodes: string[];
  appliesTo?: string[];
  supportType: RapSupportType;
  mappingConfidence: number;
  specificity: number;
  partnerPrecedence: number;
  active: boolean;
}

export interface RapParsedItem {
  rowId: string;
  costItemCode: string;
  costItemDescription?: string;
  quantity?: number;
  amount?: number;
  rejectionReason?: string;
  diagnosisCodes: string[];
  source: "XLSX" | "XLS" | "CSV" | "TSV" | "JSON";
}

export interface RapDecisionTrace {
  itemRowId: string;
  candidateCodes: string[];
  kbFilteredCodes: string[];
  rankedCodes: string[];
  selectedCodes: string[];
  status: RapMatchStatus;
  reason: string;
}

export interface RapMatchResult {
  status: RapMatchStatus;
  selected: RapDiagnosisCandidate[];
  trace: RapDecisionTrace;
}

export interface RapTableCell {
  value: string | number | boolean | null;
  row: number;
  column: number;
}

export interface RapTabularDocument {
  format: "CSV" | "TSV" | "XLSX" | "XLS";
  sheetName?: string;
  rows: RapTableCell[][];
  headers: string[];
}

export interface RapRenderChange {
  row: number;
  column: number;
  value: string | number | boolean | null;
}

export interface RapRenderedDocument {
  format: RapTabularDocument["format"];
  sheetName?: string;
  rows: RapTableCell[][];
  changes: RapRenderChange[];
}
