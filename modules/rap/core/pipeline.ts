import { extractParsedItems, parseTabularDocument } from "./parser";
import { matchDiagnoses } from "./matcher";
import { renderTargetColumn } from "./renderer";
import { InMemoryKnowledgeBase } from "./knowledge-base";
import type { KnowledgeBase } from "./knowledge-base";
import type { RapDiagnosisCandidate, RapKnowledgeBaseEntry, RapRenderChange, RapRenderedDocument, RapTabularDocument } from "./types";

export interface RapPipelineItemResult {
  rowId: string;
  match: ReturnType<typeof matchDiagnoses>;
}

export interface RapPipelineResult {
  document: RapTabularDocument;
  items: RapPipelineItemResult[];
}

export function analyzeRejectionAdvice(
  input: Uint8Array | string,
  format: RapTabularDocument["format"],
  candidatesByRow: Record<string, RapDiagnosisCandidate[]>,
  knowledgeBase: RapKnowledgeBaseEntry[] | KnowledgeBase,
): RapPipelineResult {
  const document = parseTabularDocument(input, format);
  const items = extractParsedItems(document);
  const kb = "findForItem" in knowledgeBase ? knowledgeBase : new InMemoryKnowledgeBase(knowledgeBase);
  return {
    document,
    items: items.map((item) => ({ rowId: item.rowId, match: matchDiagnoses(item, candidatesByRow[item.rowId] ?? [], kb) })),
  };
}

export function draftRenderedAdvice(
  document: RapTabularDocument,
  changes: readonly RapRenderChange[],
  targetColumn: number,
): RapRenderedDocument {
  return renderTargetColumn(document, changes, targetColumn);
}
