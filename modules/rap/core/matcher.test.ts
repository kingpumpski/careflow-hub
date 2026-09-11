import { describe, expect, it } from "vitest";
import { InMemoryKnowledgeBase } from "./knowledge-base";
import { matchDiagnoses } from "./matcher";
import type { RapDiagnosisCandidate, RapKnowledgeBaseEntry, RapParsedItem } from "./types";

const item: RapParsedItem = {
  rowId: "7",
  costItemCode: "LAB-001",
  diagnosisCodes: [],
  source: "CSV",
};

const candidate = (code: string, supportType: RapDiagnosisCandidate["supportType"] = "REQUIRED"): RapDiagnosisCandidate => ({
  code,
  description: code,
  supportType,
  confidence: 0.98,
  specificity: 0.9,
  recencyScore: 0.9,
  partnerPrecedence: supportType === "SUPPORTING" ? 0 : 1,
});

const kb = (...entries: Partial<RapKnowledgeBaseEntry>[]): InMemoryKnowledgeBase =>
  new InMemoryKnowledgeBase(entries.map((entry, index) => ({
    id: String(index + 1),
    diagnosisCode: entry.diagnosisCode ?? "DX-001",
    costItemCodes: entry.costItemCodes ?? ["LAB-001"],
    supportType: entry.supportType ?? "REQUIRED",
    mappingConfidence: entry.mappingConfidence ?? 0.95,
    specificity: entry.specificity ?? 0.9,
    partnerPrecedence: entry.partnerPrecedence ?? 0,
    active: entry.active ?? true,
    appliesTo: entry.appliesTo,
  })));

describe("RAP deterministic diagnosis decision table", () => {
  it("selects the single applicable REQUIRED diagnosis", () => {
    const result = matchDiagnoses(item, [candidate("DX-001")], kb({ diagnosisCode: "DX-001" }));
    expect(result.status).toBe("MATCHED");
    expect(result.selected.map((x) => x.code)).toEqual(["DX-001"]);
  });

  it("selects all applicable REQUIRED diagnoses", () => {
    const result = matchDiagnoses(
      item,
      [candidate("DX-001"), candidate("DX-002")],
      kb({ diagnosisCode: "DX-001" }, { diagnosisCode: "DX-002" }),
    );
    expect(result.selected.map((x) => x.code)).toEqual(["DX-001", "DX-002"]);
  });

  it("does not auto-select SUPPORTING without partner precedence", () => {
    const result = matchDiagnoses(item, [candidate("DX-001", "SUPPORTING")], kb({ diagnosisCode: "DX-001", supportType: "SUPPORTING" }));
    expect(result.status).toBe("UNRESOLVED");
    expect(result.selected).toHaveLength(0);
  });

  it("selects SUPPORTING when the KB explicitly gives partner precedence", () => {
    const result = matchDiagnoses(
      item,
      [candidate("DX-001", "SUPPORTING")],
      kb({ diagnosisCode: "DX-001", supportType: "SUPPORTING", partnerPrecedence: 1 }),
    );
    expect(result.status).toBe("MATCHED");
  });

  it("returns UNRESOLVED when no KB mapping exists", () => {
    const result = matchDiagnoses(item, [candidate("DX-001")], new InMemoryKnowledgeBase([]));
    expect(result.status).toBe("UNRESOLVED");
    expect(result.trace.reason).toContain("No active knowledge-base mapping");
  });

  it("filters candidates that are not mapped to the cost item", () => {
    const result = matchDiagnoses(item, [candidate("DX-001"), candidate("DX-999")], kb({ diagnosisCode: "DX-001" }));
    expect(result.trace.kbFilteredCodes).toEqual(["DX-001"]);
  });

  it("ignores inactive KB entries", () => {
    const result = matchDiagnoses(item, [candidate("DX-001")], kb({ diagnosisCode: "DX-001", active: false }));
    expect(result.status).toBe("UNRESOLVED");
  });
});
