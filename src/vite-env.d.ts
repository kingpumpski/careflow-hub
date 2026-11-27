/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_CAREFLOW_PREAUTH_HANDOFF_ENABLED?: string;
  readonly VITE_CAREFLOW_CLAIM_CASES_ENABLED?: string;
  readonly VITE_CAREFLOW_SETTLEMENT_EXCEPTIONS_ENABLED?: string;
  readonly VITE_CAREFLOW_SETTLEMENT_REMITTANCES_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
