import 'server-only';

import { createClient } from '@supabase/supabase-js';

export function authClient(key: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export function deletionConfigured() {
  return !!process.env.SUPABASE_SECRET_KEY;
}

export function accountAdmin() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  return secret ? authClient(secret) : null;
}
