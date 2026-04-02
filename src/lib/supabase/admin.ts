import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client that does NOT use next/headers cookies.
 * Safe to use in after() callbacks, background jobs, and non-request contexts.
 * Bypasses RLS — use only for trusted server-side operations.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
