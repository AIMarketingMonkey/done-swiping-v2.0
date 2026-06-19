import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from '../env.js';

let _client: SupabaseClient | null = null;

/**
 * Returns a Supabase client authenticated with the service-role key.
 *
 * SECURITY: This client bypasses Row Level Security. It must NEVER be used in
 * client-facing code or have its credentials forwarded to clients. Only call
 * from trusted server-side handlers.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client;

  const url = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  _client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  return _client;
}
