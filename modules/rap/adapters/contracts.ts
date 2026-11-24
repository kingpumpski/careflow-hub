import type { RapParsedItem, RapRenderChange, RapRenderedDocument, RapTabularDocument } from "../core/types";

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
  /**
   * Must preserve workbook sheets/styles/metadata where the source format supports
   * it, serialize to bytes, reload/validate the serialized result against the
   * approved change set, and return a checksum of the final bytes.
   */
  exportDraft(input: {
    source: RapTabularDocument;
    rendered: RapRenderedDocument;
    approvedChanges: readonly RapRenderChange[];
  }): Promise<{ bytes: Uint8Array; checksum: string }>;
}

/**
 * These interfaces are deliberately dependency-inverted. RAP consumes contracts;
 * the host application owns the concrete adapters and RAP never imports host UI,
 * auth, notification, or persistence implementations.
 */

/** Identity and tenancy must be resolved by the host auth layer, never from document input. */
export interface RapTenantContext {
  tenantId: string;
  facilityId: string;
  userId: string;
}

export interface RapScopedPersistence {
  /** Every read/write must enforce both tenant and facility scope at the storage boundary. */
  withScope<T>(context: RapTenantContext, operation: () => Promise<T>): Promise<T>;
}

/**
 * Implement with one atomic database statement/RPC (e.g. UPDATE ... WHERE status='ISSUED'
 * RETURNING). A read-then-write implementation is not safe under concurrent replay.
 */
export interface RapAtomicApprovalStore {
  consume(input: {
    tokenId: string;
    actorId: string;
    action: string;
    payloadHash: string;
  }): Promise<boolean>;
}

export interface RapImmutableAuditWriter {
  append(event: {
    tenantId: string;
    facilityId: string;
    actorId: string;
    eventType: string;
    correlationId: string;
    payloadHash: string;
    occurredAt: string;
  }): Promise<void>;
}

/** Queue implementations must enforce a unique idempotency key at enqueue time. */
export interface RapNotificationOutbox {
  enqueue(input: {
    tenantId: string;
    facilityId: string;
    recipientUserIds: readonly string[];
    category: "RETENTION" | "CLAIM_REJECTION" | "PREAUTH" | "AUDIT_FINDING" | "IT_REPORT" | "AI_ESCALATION" | "CSA_INCIDENT" | "DPC_BREACH";
    title: string;
    message: string;
    idempotencyKey: string;
    deepLink?: string;
  }): Promise<"ENQUEUED" | "ALREADY_EXISTS">;
}
