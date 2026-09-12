export const RAP_DEFAULTS = {
  enabled: false,
  retentionEnabled: false,
  agentClaimsEnabled: false,
  agentAdminEnabled: false,
  agentItEnabled: false,
  minimumAiConfidence: 0.85,
  approvalTokenTtlMinutes: 15,
  defaultRetentionDays: 90,
  jsonRetentionDays: 365,
  maxDocumentBytes: 25 * 1024 * 1024,
  maxRows: 100_000,
  maxAiActionsPerMinute: 30,
  externalLlmRetentionAllowed: false,
  externalLlmTrainingAllowed: false,
} as const;

export interface RapRuntimeConfig {
  enabled: boolean;
  retentionEnabled: boolean;
  agentClaimsEnabled: boolean;
  agentAdminEnabled: boolean;
  agentItEnabled: boolean;
  minimumAiConfidence: number;
  approvalTokenTtlMinutes: number;
  defaultRetentionDays: number;
  jsonRetentionDays: number;
}

const boolEnv = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined ? fallback : value.toLowerCase() === "true";

const numberEnv = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function loadRapRuntimeConfig(env: Record<string, string | undefined>): RapRuntimeConfig {
  const minimumAiConfidence = numberEnv(env.RAP_MIN_AI_CONFIDENCE, RAP_DEFAULTS.minimumAiConfidence);
  if (minimumAiConfidence < 0 || minimumAiConfidence > 1) {
    throw new Error("RAP_MIN_AI_CONFIDENCE must be between 0 and 1.");
  }

  return {
    enabled: boolEnv(env.RAP_ENABLED, RAP_DEFAULTS.enabled),
    retentionEnabled: boolEnv(env.RAP_RETENTION_ENABLED, RAP_DEFAULTS.retentionEnabled),
    agentClaimsEnabled: boolEnv(env.RAP_AGENT_CLAIMS_ENABLED, RAP_DEFAULTS.agentClaimsEnabled),
    agentAdminEnabled: boolEnv(env.RAP_AGENT_ADMIN_ENABLED, RAP_DEFAULTS.agentAdminEnabled),
    agentItEnabled: boolEnv(env.RAP_AGENT_IT_ENABLED, RAP_DEFAULTS.agentItEnabled),
    minimumAiConfidence,
    approvalTokenTtlMinutes: numberEnv(env.RAP_APPROVAL_TOKEN_TTL_MINUTES, RAP_DEFAULTS.approvalTokenTtlMinutes),
    defaultRetentionDays: numberEnv(env.RAP_DEFAULT_RETENTION_DAYS, RAP_DEFAULTS.defaultRetentionDays),
    jsonRetentionDays: numberEnv(env.RAP_JSON_RETENTION_DAYS, RAP_DEFAULTS.jsonRetentionDays),
  };
}

export const RAP_FORBIDDEN_EXTERNAL_PROCESSING = Object.freeze({
  rawPhi: true,
  rawPii: true,
  secrets: true,
  internalIds: true,
  credentials: true,
});
