import { getCareFlowDataMode, type CareFlowDataMode } from "./data-mode";
import {
  createOfflinePreAuthDraft,
  finalizeOfflinePreAuth,
  findOfflinePreAuthDuplicates,
  type OfflinePreAuthDraft,
  type OfflinePreAuthFinalizeResult,
} from "./preauth-offline-repository";
import { listOffline, type OfflineEntity, type OfflineRecord } from "./offline-store";
import type { PreAuthReviewInput } from "@/modules/authorization/preauth-review";

const ENTITY_BY_TABLE: Partial<Record<string, OfflineEntity>> = {
  patients: "patients",
  insurance_companies: "insurance_companies",
  doctors: "doctors",
  procedures: "procedures",
  diagnosis_codes: "diagnosis_codes",
  preauth_catalog_items: "preauth_catalog_items",
  system_settings: "system_settings",
  preauth_insurer_tariffs: "preauth_insurer_tariffs",
  pre_authorizations: "preauthorizations",
  preauth_items: "preauth_items",
  preauthorization_versions: "preauthorization_versions",
  preauthorization_submissions: "preauthorization_submissions",
  preauthorization_audit_events: "preauthorization_audit_events",
};

export type PreAuthDataProvider = {
  mode: CareFlowDataMode;
  listReferenceData<T extends OfflineRecord = OfflineRecord>(table: string): Promise<T[]>;
  findDuplicates(signature: string, excludeId?: string): Promise<OfflinePreAuthDraft[]>;
  createDraft(input: PreAuthReviewInput, createdBy?: string | null): Promise<OfflinePreAuthDraft>;
  finalizeDraft(input: {
    preauthId: string;
    reviewInput: PreAuthReviewInput;
    recipientManifest: unknown;
    subject: string;
    messageBody: string;
  }): Promise<OfflinePreAuthFinalizeResult>;
};

export function createOfflinePreAuthDataProvider(): PreAuthDataProvider {
  return {
    mode: "offline",
    async listReferenceData<T extends OfflineRecord = OfflineRecord>(table: string) {
      const entity = ENTITY_BY_TABLE[table];
      if (!entity) return [];
      return listOffline<T>(entity);
    },
    findDuplicates: findOfflinePreAuthDuplicates,
    createDraft: createOfflinePreAuthDraft,
    finalizeDraft: ({ preauthId, reviewInput, recipientManifest, subject, messageBody }) =>
      finalizeOfflinePreAuth(preauthId, reviewInput, recipientManifest, subject, messageBody),
  };
}

export function createPreAuthDataProvider(): PreAuthDataProvider | null {
  return getCareFlowDataMode() === "offline" ? createOfflinePreAuthDataProvider() : null;
}
