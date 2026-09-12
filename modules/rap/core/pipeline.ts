import { extractParsedItems, parseTabularDocument } from "./parser";
import { matchDiagnosis } from "./matcher";
import { renderTargetColumn } from "./renderer";
import type { RapDiagnosisCandidate, RapKnowledgeBaseEntry, RapRenderChange, RapRenderedDocument, RapTabularDocument } from "./types";

export interface RapPipelineItemResult {
  rowId: string;
  match: ReturnType<typeof matchDiagnosis>;
}

export interface RapPipelineResult {
  document: RapTabularDocument;
  items: RapPipelineItemResult[];
}

export function analyzeRejectionAdvice(
  input: Uint8Array | string,
  format: RapTabularDocument["format"],
  candidatesByRow: Record<string, RapDiagnosisCandidate[]>,
  knowledgeBase: RapKnowledgeBaseEntry[],
): RapPipelineResult {
  const document = parseTabularDocument(input, format);
  const items = extractParsedItems(document);
  return {
    document,
    items: items.map((item) => ({ rowId: item.rowId, match: matchDiagnosis(item.rowId, candidatesByRow[item.rowId] ?? [], knowledgeBase, item.costItemCode) })),
  };
}

export function draftRenderedAdvice(
  document: RapTabularDocument,
  changes: readonly RapRenderChange[],
  targetColumn: number,
): RapRenderedDocument {
  return renderTargetColumn(document, changes, targetColumn);
}
