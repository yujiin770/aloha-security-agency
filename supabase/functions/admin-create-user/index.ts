// admin-create-user
// -----------------------------------------------------------------------------
// Creates a staff member and assigns their role. This cannot be done from the
// browser: creating an auth user requires the service_role key, which must never
// reach a client bundle. Only owner/admin may call it.
//
// The account is created already confirmed (`email_confirm: true`) with the
// password the admin chose — no invitation email is sent and there is no
// pending-confirmation state. The admin hands the password to the new user,
// who can change it from their profile.
//
// Deploy:  supabase functions deploy admin-create-user
//          — or paste this whole file into the dashboard's index.ts.
// Secrets: ALLOWED_ORIGINS
//          (SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are
//           injected by the platform — do not set them yourself.)
//
// This file is deliberately self-contained. A `_shared/` folder cannot be
// deployed from the dashboard — the slug `_shared` is rejected, and a
// `../_shared/…` import fails to resolve at bundle time because only the
// function's own directory is uploaded. The CORS and auth helpers below are
// therefore duplicated across the three functions; keep them in step by hand.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

// ---------- cors ----------
// A wildcard is never emitted: these functions carry privileged capability, so
// the browser must only be told a known origin is allowed.
// Read per request, not once at module load. Edge workers stay warm across
// invocations, so a top-level const kept serving a stale allowlist for minutes
// after `supabase secrets set` — which reads as "the fix did not work".
function allowedOrigins(): string[] {
  return (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
}

// supabase-js sends a moving set of headers (x-client-info, x-application-name,
// x-supabase-api-version…) that changes between releases. Reflecting whatever the
// preflight asks for stops each new header from becoming another CORS outage.
// This grants nothing on its own: Allow-Headers only says which headers may be
// *sent*, and every request is still gated by requireCaller() below.
const DEFAULT_ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type'

function corsHeaders(
  origin: string | null,
  requestedHeaders?: string | null,
): Record<string, string> {
  const allowed = allowedOrigins()
  const match = origin && allowed.includes(origin) ? origin : allowed[0]
  return {
    'Access-Control-Allow-Origin': match ?? 'http://localhost:5173',
    'Access-Control-Allow-Headers': requestedHeaders?.trim()
      ? requestedHeaders
      : DEFAULT_ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // Origin *and* the request-headers list are both inputs now, so both must be
    // keyed on by any cache sitting in front of this.
    Vary: 'Origin, Access-Control-Request-Headers',
    // Echoes what the server actually parsed, so a mismatch can be diagnosed
    // from the browser's network tab instead of guessing at the secret's value.
    'X-Allowed-Origins-Count': String(allowed.length),
  }
}

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

function preflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null
  return new Response('ok', {
    headers: corsHeaders(
      req.headers.get('origin'),
      req.headers.get('access-control-request-headers'),
    ),
  })
}

// ---------- auth ----------
// Two clients are involved and the distinction matters:
//   - the client built in requireCaller() carries the caller's JWT and is used
//     ONLY to establish who they are. It is subject to RLS.
//   - adminClient() carries the service_role key, bypasses RLS entirely, and is
//     used only after the caller has been authorised.
// The service_role key must never be returned in a response or logged.

type AppRole =
  | 'owner'
  | 'admin'
  | 'system_administrator'
  | 'hr_staff'
  | 'recruitment_officer'
  | 'deployment_officer'
  | 'branch_coordinator'

/**
 * Administrator-equivalent roles — the mirror of `is_admin()` in SQL
 * (migration 0015) and of `ADMIN_ROLES` in src/utils/constants.ts.
 * `system_administrator` has full access; only `owner` may grant `owner`.
 */
const ADMIN_ROLES: AppRole[] = ['owner', 'admin', 'system_administrator']

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

interface Caller {
  id: string
  email: string
  roles: AppRole[]
}

async function requireCaller(req: Request, allowedRoles: AppRole[]): Promise<Caller> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Missing bearer token')
  }

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )

  const { data: userData, error } = await userClient.auth.getUser()
  if (error || !userData.user) throw new HttpError(401, 'Invalid session')

  const { data: roleRows, error: roleError } = await adminClient()
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id)

  if (roleError) throw new HttpError(500, roleError.message)

  const roles = (roleRows ?? []).map((r) => r.role as AppRole)

  if (!roles.some((r) => allowedRoles.includes(r))) {
    // The caller's own roles are named in the message: this is information they
    // already hold about themselves, and without it a 403 is indistinguishable
    // from a stale deployment of this function.
    throw new HttpError(
      403,
      `Insufficient privileges. Your roles: ${
        roles.length ? roles.join(', ') : 'none'
      }. Required: ${allowedRoles.join(', ')}.`,
    )
  }

  return { id: userData.user.id, email: userData.user.email ?? '', roles }
}

// ---------- handler ----------
const ASSIGNABLE: AppRole[] = [
  'admin',
  'system_administrator',
  'hr_staff',
  'recruitment_officer',
  'deployment_officer',
  'branch_coordinator',
]

interface Payload {
  email: string
  full_name: string
  password: string
  role: AppRole
  phone?: string
}

const MIN_PASSWORD = 8

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  const origin = req.headers.get('origin')

  try {
    const caller = await requireCaller(req, ADMIN_ROLES)
    const body = (await req.json()) as Payload

    if (!body?.email || !body?.full_name || !body?.role) {
      throw new HttpError(400, 'email, full_name and role are required')
    }
    if (!body.password || body.password.length < MIN_PASSWORD) {
      throw new HttpError(
        400,
        `password is required and must be at least ${MIN_PASSWORD} characters`,
      )
    }
    // Only an owner may mint another owner — mirrors the user_roles RLS policy.
    if (body.role === 'owner' && !caller.roles.includes('owner')) {
      throw new HttpError(403, 'Only an owner may grant the owner role')
    }
    if (body.role !== 'owner' && !ASSIGNABLE.includes(body.role)) {
      throw new HttpError(400, `Unknown role: ${body.role}`)
    }

    const admin = adminClient()

    // `email_confirm: true` marks the address as verified at creation, so the
    // account can sign in straight away and no confirmation mail is sent.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.full_name },
    })

    if (createError || !created.user) {
      throw new HttpError(400, createError?.message ?? 'Could not create user')
    }

    // handle_new_user() has already created the profile row; fill in the rest.
    const { error: profileError } = await admin
      .from('profiles')
      .update({
        full_name: body.full_name,
        phone: body.phone ?? null,
      })
      .eq('id', created.user.id)

    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id)
      throw new HttpError(400, profileError.message)
    }

    const { error: roleError } = await admin
      .from('user_roles')
      .insert({ user_id: created.user.id, role: body.role, granted_by: caller.id })

    if (roleError) {
      // Roll the auth user back so a failed grant does not leave an orphan
      // account that can sign in with no role.
      await admin.auth.admin.deleteUser(created.user.id)
      throw new HttpError(400, roleError.message)
    }

    await admin.from('activity_logs').insert({
      actor_id: caller.id,
      action: 'user.created',
      entity_type: 'profile',
      entity_id: created.user.id,
      summary: `${body.full_name} created as ${body.role.replace(/_/g, ' ')}`,
      metadata: { email: body.email, role: body.role },
    })

    return jsonResponse(
      { id: created.user.id, email: body.email, role: body.role },
      201,
      origin,
    )
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500
    const message = err instanceof Error ? err.message : 'Unexpected error'
    // Never leak internals on a 500.
    return jsonResponse(
      { error: status === 500 ? 'Internal error' : message },
      status,
      origin,
    )
  }
})
