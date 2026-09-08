// CareFlow runs hybrid/offline-first, but the production backend is the
// Bredas Insurance / Claims Tracker Supabase project. Environment variables
// still override these safe-to-expose publishable client values for deployments.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { brokeredPreviewStorage } from './previewAuthStorage';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://jajfdgknctzqypdtvmxo.supabase.co';
// Publishable/anon keys are intended for browser clients. Never put a service-role
// or secret key here; privileged operations stay inside Edge Functions.
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_t0MoAS6_gg7y6nIA7cjJ2g_q1BihZMR';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: brokeredPreviewStorage(),
    persistSession: true,
    autoRefreshToken: true,
  },
});
