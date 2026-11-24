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

function boolEnv(value: string | undefined, fallback: boolean, name: string): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`${name} must be either "true" or "false".`);
}

function numberEnv(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a finite number.`);
  return parsed;
}

function integerInRange(value: number, name: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

export function loadRapRuntimeConfig(env: Record<string, string | undefined>): RapRuntimeConfig {
  const minimumAiConfidence = numberEnv(
    env.RAP_MIN_AI_CONFIDENCE,
    RAP_DEFAULTS.minimumAiConfidence,
    "RAP_MIN_AI_CONFIDENCE",
  );
  if (minimumAiConfidence < 0 || minimumAiConfidence > 1) {
    throw new Error("RAP_MIN_AI_CONFIDENCE must be between 0 and 1.");
  }

  const approvalTokenTtlMinutes = integerInRange(
    numberEnv(env.RAP_APPROVAL_TOKEN_TTL_MINUTES, RAP_DEFAULTS.approvalTokenTtlMinutes, "RAP_APPROVAL_TOKEN_TTL_MINUTES"),
    "RAP_APPROVAL_TOKEN_TTL_MINUTES",
    1,
    15,
  );
  const defaultRetentionDays = integerInRange(
    numberEnv(env.RAP_DEFAULT_RETENTION_DAYS, RAP_DEFAULTS.defaultRetentionDays, "RAP_DEFAULT_RETENTION_DAYS"),
    "RAP_DEFAULT_RETENTION_DAYS",
    0,
    36500,
  );
  const jsonRetentionDays = integerInRange(
    numberEnv(env.RAP_JSON_RETENTION_DAYS, RAP_DEFAULTS.jsonRetentionDays, "RAP_JSON_RETENTION_DAYS"),
    "RAP_JSON_RETENTION_DAYS",
    0,
    36500,
  );

  return {
    enabled: boolEnv(env.RAP_ENABLED, RAP_DEFAULTS.enabled, "RAP_ENABLED"),
    retentionEnabled: boolEnv(env.RAP_RETENTION_ENABLED, RAP_DEFAULTS.retentionEnabled, "RAP_RETENTION_ENABLED"),
    agentClaimsEnabled: boolEnv(env.RAP_AGENT_CLAIMS_ENABLED, RAP_DEFAULTS.agentClaimsEnabled, "RAP_AGENT_CLAIMS_ENABLED"),
    agentAdminEnabled: boolEnv(env.RAP_AGENT_ADMIN_ENABLED, RAP_DEFAULTS.agentAdminEnabled, "RAP_AGENT_ADMIN_ENABLED"),
    agentItEnabled: boolEnv(env.RAP_AGENT_IT_ENABLED, RAP_DEFAULTS.agentItEnabled, "RAP_AGENT_IT_ENABLED"),
    minimumAiConfidence,
    approvalTokenTtlMinutes,
    defaultRetentionDays,
    jsonRetentionDays,
  };
}

export const RAP_FORBIDDEN_EXTERNAL_PROCESSING = Object.freeze({
  rawPhi: true,
  rawPii: true,
  secrets: true,
  internalIds: true,
  credentials: true,
});
