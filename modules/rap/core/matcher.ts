import type {
  RapDecisionTrace,
  RapDiagnosisCandidate,
  RapKnowledgeBaseEntry,
  RapMatchResult,
  RapParsedItem,
} from "./types";
import type { KnowledgeBase } from "./knowledge-base";

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const normalize = (value: string) => value.trim().toUpperCase();

function rankCandidate(candidate: RapDiagnosisCandidate, kb?: RapKnowledgeBaseEntry): number {
  const mapping = kb?.mappingConfidence ?? candidate.confidence;
  const support = candidate.supportType === "REQUIRED" ? 1 : 0;
  return (
    support * 1000 +
    clamp(mapping) * 100 +
    clamp(candidate.confidence) * 100 +
    clamp(candidate.specificity) * 10 +
    clamp(candidate.recencyScore) * 5 +
    clamp(candidate.partnerPrecedence)
  );
}

export function matchDiagnoses(
  item: RapParsedItem,
  candidates: readonly RapDiagnosisCandidate[],
  knowledgeBase: KnowledgeBase,
): RapMatchResult {
  const candidateCodes = candidates.map((candidate) => normalize(candidate.code));
  const kbEntries = knowledgeBase.findForItem(item);
  const kbCodes = new Set(kbEntries.map((entry) => normalize(entry.diagnosisCode)));
  const filtered = candidates.filter((candidate) => kbCodes.has(normalize(candidate.code)));

  const ranked = [...filtered].sort((a, b) => {
    const aKb = kbEntries.find((entry) => normalize(entry.diagnosisCode) === normalize(a.code));
    const bKb = kbEntries.find((entry) => normalize(entry.diagnosisCode) === normalize(b.code));
    return rankCandidate(b, bKb) - rankCandidate(a, aKb);
  });

  const required = ranked.filter((candidate) => candidate.supportType === "REQUIRED");
  const supporting = ranked.filter((candidate) => candidate.supportType === "SUPPORTING");

  // Required diagnoses are never collapsed: all applicable REQUIRED diagnoses are retained.
  // SUPPORTING diagnoses are not auto-selected unless a partner-specific KB entry promotes them.
  const selected = required.length > 0 ? required : supporting.filter((candidate) => {
    const entry = kbEntries.find((kb) => normalize(kb.diagnosisCode) === normalize(candidate.code));
    return entry?.supportType === "SUPPORTING" && entry.partnerPrecedence > 0;
  });

  const status = selected.length ? "MATCHED" : "UNRESOLVED";
  const trace: RapDecisionTrace = {
    itemRowId: item.rowId,
    candidateCodes,
    kbFilteredCodes: filtered.map((candidate) => normalize(candidate.code)),
    rankedCodes: ranked.map((candidate) => normalize(candidate.code)),
    selectedCodes: selected.map((candidate) => normalize(candidate.code)),
    status,
    reason: selected.length
      ? required.length
        ? "Applicable REQUIRED diagnosis mapping selected."
        : "Partner-precedence SUPPORTING diagnosis mapping selected."
      : kbEntries.length
        ? "No eligible diagnosis mapping met the deterministic selection rule."
        : "No active knowledge-base mapping found; escalation required.",
  };

  return { status, selected, trace };
}
