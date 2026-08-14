// refresh-analytics
// -----------------------------------------------------------------------------
// Refreshes mv_recruitment_funnel and enforces the applicant retention policy.
// Intended to run on a schedule (Supabase cron / pg_cron / external scheduler),
// not from the UI.
//
// Because a scheduler has no user session, the call is authenticated with a
// shared secret in the X-Cron-Secret header, compared in constant time.
//
// Deploy:  supabase functions deploy refresh-analytics --no-verify-jwt
//          — or paste this whole file into the dashboard's index.ts and turn
//            OFF "Verify JWT" on the function's Settings tab. Leaving it on
//            makes the platform reject every scheduled call with a 401 before
//            the secret check below ever runs.
// Secrets: CRON_SECRET
//          (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the
//           platform — do not set them yourself.)
//
// Self-contained by necessity — see the note in admin-create-user/index.ts.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

Deno.serve(async (req) => {
  const expected = Deno.env.get('CRON_SECRET')
  const provided = req.headers.get('x-cron-secret') ?? ''

  if (!expected || !timingSafeEqual(provided, expected)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const admin = adminClient()
  const results: Record<string, unknown> = {}

  const { error: refreshError } = await admin.rpc('refresh_analytics')
  results.analytics = refreshError ? { error: refreshError.message } : 'refreshed'

  const { data: purged, error: purgeError } = await admin.rpc(
    'purge_expired_applicants',
  )
  results.retention = purgeError
    ? { error: purgeError.message }
    : { purged: purged ?? 0 }

  const status = refreshError || purgeError ? 500 : 200
  return new Response(JSON.stringify({ ran_at: new Date().toISOString(), results }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
})
