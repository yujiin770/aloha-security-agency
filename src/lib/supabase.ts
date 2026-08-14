import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { env } from './env'

/**
 * The single Supabase client for the whole app.
 *
 * Typed with `Database`, so every `.from()` and `.rpc()` call is checked against
 * the schema in `supabase/migrations/`.
 *
 * This module is imported ONLY by the per-feature `api` folders under
 * `src/features`. Components never talk to Supabase directly — that separation
 * is what makes the data layer testable and the query keys coherent.
 */
export const supabase = createClient<Database>(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'aloha-auth',
    },
    global: {
      headers: { 'x-application-name': 'aloha-security-agency' },
    },
    db: { schema: 'public' },
    realtime: {
      // Enough for notification + pipeline streams; keeps a slow client from
      // being flooded by a bulk import.
      params: { eventsPerSecond: 5 },
    },
  },
)

/** Storage buckets, mirrored from `supabase/migrations/0010_storage.sql`. */
export const BUCKETS = {
  resumes: 'resumes',
  governmentIds: 'government-ids',
  certificates: 'certificates',
  personnelImages: 'personnel-images',
  reports: 'reports',
  companyAssets: 'company-assets',
} as const

export type BucketId = (typeof BUCKETS)[keyof typeof BUCKETS]

/** Lifetime of the signed URLs minted for private documents. */
export const SIGNED_URL_TTL_SECONDS = 60
