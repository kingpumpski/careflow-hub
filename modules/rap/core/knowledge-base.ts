import type { RapKnowledgeBaseEntry, RapParsedItem } from "./types";

export interface KnowledgeBase {
  readonly entries: readonly RapKnowledgeBaseEntry[];
  findForItem(item: RapParsedItem): RapKnowledgeBaseEntry[];
}

const normalize = (value: string) => value.trim().toUpperCase();

export class InMemoryKnowledgeBase implements KnowledgeBase {
  constructor(public readonly entries: readonly RapKnowledgeBaseEntry[]) {}

  findForItem(item: RapParsedItem): RapKnowledgeBaseEntry[] {
    const code = normalize(item.costItemCode);
    const diagnosisCodes = new Set(item.diagnosisCodes.map(normalize));

    return this.entries.filter((entry) => {
      if (!entry.active) return false;
      const applies = entry.appliesTo?.map(normalize);
      const appliesToItem = !applies?.length || applies.includes(code);
      const mapsItem = entry.costItemCodes.map(normalize).includes(code);
      const mapsDiagnosis = diagnosisCodes.has(normalize(entry.diagnosisCode));
      return appliesToItem && (mapsItem || mapsDiagnosis);
    });
  }
}
