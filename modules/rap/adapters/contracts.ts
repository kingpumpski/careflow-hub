import type { RapParsedItem, RapRenderedDocument } from "../core/types";

export interface RapClaimReader {
  getClaim(claimId: string): Promise<unknown>;
  getClaimItems(claimId: string): Promise<readonly RapParsedItem[]>;
  getDiagnoses(claimId: string): Promise<readonly string[]>;
  getPreauthorization(claimId: string): Promise<unknown | null>;
}

export interface RapNotificationService {
  notify(input: {
    category: "RETENTION" | "CLAIM_REJECTION" | "PREAUTH" | "AUDIT_FINDING" | "IT_REPORT" | "AI_ESCALATION" | "CSA_INCIDENT" | "DPC_BREACH";
    recipientUserIds: readonly string[];
    title: string;
    message: string;
    deepLink?: string;
    idempotencyKey: string;
    action?: { label: string; deepLink: string };
  }): Promise<void>;
}

export interface RapDocumentExporter {
  exportDraft(document: RapRenderedDocument): Promise<{ bytes: Uint8Array; checksum: string }>;
}

/**
 * These interfaces are deliberately dependency-inverted. RAP consumes contracts;
 * the host application owns the concrete adapters and RAP never imports host UI,
 * auth, notification, or persistence implementations.
 */
