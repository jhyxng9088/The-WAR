import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://zhkilaqtfkqpkunxouxa.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_PwSuVIGms9YgHzKYUaDoWw_WS45AEDs';

// This key is intentionally publishable. Authorization is enforced by Supabase
// Auth + Postgres RLS/RPC policies; privileged service-role keys never ship to the client.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
