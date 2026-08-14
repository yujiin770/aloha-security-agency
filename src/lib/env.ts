import { z } from 'zod'

/**
 * Environment configuration.
 *
 * Validated rather than trusted: a missing or malformed Supabase URL should
 * surface as a clear setup screen at boot, not as a cryptic network error three
 * screens into the app. `isConfigured` is what `<EnvGate>` reads.
 *
 * Only VITE_-prefixed variables exist here, and only the anon key — anything in
 * this file ships to the browser. The service_role key belongs exclusively in
 * Edge Function secrets.
 */
const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url('VITE_SUPABASE_URL must be a valid URL'),
  VITE_SUPABASE_ANON_KEY: z
    .string()
    .min(20, 'VITE_SUPABASE_ANON_KEY looks too short to be a real key'),
  VITE_APP_NAME: z.string().default('Aloha Security Agency'),
  VITE_SUPPORT_EMAIL: z.string().email().default('recruitment@alohasecurity.ph'),
})

const raw = {
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  VITE_APP_NAME: import.meta.env.VITE_APP_NAME,
  VITE_SUPPORT_EMAIL: import.meta.env.VITE_SUPPORT_EMAIL,
}

const parsed = envSchema.safeParse(raw)

export const isConfigured = parsed.success

export const envErrors: string[] = parsed.success
  ? []
  : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)

/**
 * Falls back to inert placeholders when unconfigured so that module-level
 * `createClient` calls don't throw during boot. Every network call will fail,
 * which is fine — `<EnvGate>` renders the setup screen instead of the app.
 */
export const env = parsed.success
  ? parsed.data
  : {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'not-configured-not-configured',
      VITE_APP_NAME: 'Aloha Security Agency',
      VITE_SUPPORT_EMAIL: 'recruitment@alohasecurity.ph',
    }

export const APP_NAME = env.VITE_APP_NAME
export const SUPPORT_EMAIL = env.VITE_SUPPORT_EMAIL
