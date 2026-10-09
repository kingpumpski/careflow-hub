export type RapPersona = "CLAIMS_SPECIALIST" | "PROJECT_ADMINISTRATOR" | "IT_OFFICER";

export const RAP_PERSONA_POLICIES = Object.freeze({
  CLAIMS_SPECIALIST: {
    tools: [
      "get_claim",
      "get_claim_items",
      "get_diagnoses",
      "get_preauth",
      "query_master_diagnoses",
      "lookup_kb_mapping",
      "parse_rejection_advice",
      "match_diagnoses",
      "render_updated_document_draft",
      "generate_preauth_draft",
      "propose_mapping",
      "escalate_to_human",
    ],
    mutationsRequireApproval: true,
    maySubmitToPartner: false,
    mayWriteKnowledgeBase: false,
    externalEgress: false,
  },
  PROJECT_ADMINISTRATOR: {
    tools: ["scan_integrity", "scan_orphans", "scan_stale_claims", "scan_kb_coverage", "scan_permission_drift", "scan_duplicates", "scan_rejection_spikes", "scan_retention_health", "escalate_to_human"],
    mutationsRequireApproval: true,
    maySubmitToPartner: false,
    mayWriteKnowledgeBase: false,
    externalEgress: false,
  },
  IT_OFFICER: {
    tools: ["research_security_advisory", "record_it_report", "escalate_to_human"],
    mutationsRequireApproval: true,
    maySubmitToPartner: false,
    mayWriteKnowledgeBase: false,
    externalEgress: true,
  },
} as const);

export interface RapAiSuggestion<T = unknown> {
  persona: RapPersona;
  action: string;
  confidence: number;
  result: T;
  evidence: readonly string[];
  requiresHumanReview: boolean;
}

export function enforceAiConfidence<T>(suggestion: RapAiSuggestion<T>, minimum = 0.85): RapAiSuggestion<T> {
  if (suggestion.confidence < minimum) return { ...suggestion, requiresHumanReview: true };
  return suggestion;
}

export function assertPersonaToolAllowed(persona: RapPersona, tool: string): void {
  const policy = RAP_PERSONA_POLICIES[persona];
  if (!policy.tools.includes(tool as never)) {
    throw new Error(`RAP persona ${persona} is not permitted to use ${tool}.`);
  }
}

export function assertExternalProcessingSafe(input: { containsPhi: boolean; containsPii: boolean; containsSecrets: boolean; approvedCrossBorder: boolean }): void {
  if (input.containsPhi || input.containsPii || input.containsSecrets) {
    throw new Error("RAP external processing rejected: sensitive data must remain on approved Ghana-hosted infrastructure.");
  }
  if (!input.approvedCrossBorder) throw new Error("RAP external processing requires documented cross-border approval.");
}
