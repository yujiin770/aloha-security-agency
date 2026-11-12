// send-notification-email
// -----------------------------------------------------------------------------
// Sends a transactional email (applicant status change, interview invitation)
// and records the attempt in public.email_logs.
//
// Staff only, with one exception: `{ kind: 'application_received', applicant_id,
// reference_no }` may be called anonymously by the apply form to email the new
// applicant their reference number. See handleReceipt() for why that is safe.
//
// The provider call is deliberately isolated behind `deliver()` — swap SMTP for
// an HTTP API (Resend/SendGrid/SES) by changing that one function. If no
// provider is configured the function still logs the message, so the rest of the
// system works before email is wired up.
//
// Deploy:  supabase functions deploy send-notification-email
//          — or paste this whole file into the dashboard's index.ts.
// Secrets: ALLOWED_ORIGINS, EMAIL_FROM, and then either
//            SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS   (used when SMTP_HOST is set)
//          or RESEND_API_KEY                               (the fallback transport)
//          MAIL_FROM is still read as an alias for EMAIL_FROM.
//          (SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are
//           injected by the platform — do not set them yourself.)
//
// Note this is NOT the SMTP configured under Project Settings → Auth. That one
// serves Supabase Auth's own mail (invitations, password resets) and is not
// reachable from an Edge Function, so the credentials are set again as secrets
// here. The same mailbox can back both.
//
// Self-contained by necessity — see the note in admin-create-user/index.ts.
// The cors and auth blocks below are duplicated there; keep them in step.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

// denomailer keeps reading its socket after a failed handshake and rejects on a
// promise nobody awaits ("event loop error: invalid cmd"). An unhandled
// rejection tears down the whole worker, so the *next* request is answered by
// the platform with a 503 carrying no CORS headers — a failure that looks
// nothing like the mail problem that caused it. The delivery error has already
// been captured and logged by then, so swallowing the aftershock loses nothing.
globalThis.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled rejection (suppressed to keep the worker alive)', event.reason)
  event.preventDefault()
})

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
// The caller's JWT establishes identity (subject to RLS); adminClient() carries
// the service_role key and is used only after authorisation succeeds.

type AppRole =
  | 'owner'
  | 'admin'
  | 'system_administrator'
  | 'hr_staff'
  | 'recruitment_officer'
  | 'deployment_officer'
  | 'branch_coordinator'

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

  const { data: roleRows } = await adminClient()
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id)

  const roles = (roleRows ?? []).map((r) => r.role as AppRole)

  if (!roles.some((r) => allowedRoles.includes(r))) {
    throw new HttpError(403, 'Insufficient privileges')
  }

  return { id: userData.user.id, email: userData.user.email ?? '', roles }
}

// ---------- handler ----------
interface Payload {
  to: string
  subject: string
  html: string
  /**
   * Plain-text alternative. Some clients render only this, and spam filters read
   * it — an HTML-only message scores worse. Derived from the HTML when absent.
   */
  text?: string
  template?: string
  entity_type?: string
  entity_id?: string
  /**
   * When true, a prior successful send of the same template to the same entity
   * suppresses this one. Staff routinely re-open and re-save a status, and an
   * applicant receiving "your interview is scheduled" four times reads as a
   * malfunction. Requires template + entity_id to identify the pair.
   */
  dedupe?: boolean
}

/**
 * Looks for an already-sent copy of this template for this entity.
 *
 * Runs on the service_role client by necessity: email_logs is SELECT-restricted
 * to config admins (migration 0014), so the same query from the browser returns
 * nothing for hr_staff and would defeat the check it is meant to perform.
 */
async function alreadySent(admin: SupabaseClient, body: Payload): Promise<boolean> {
  if (!body.dedupe || !body.template || !body.entity_id) return false

  const { data } = await admin
    .from('email_logs')
    .select('id')
    .eq('entity_id', body.entity_id)
    .eq('template', body.template)
    .eq('status', 'sent')
    .limit(1)

  return (data ?? []).length > 0
}

interface SendResult {
  ok: boolean
  /** Provider message id where there is one. SMTP does not give one. */
  providerId?: string
  error?: string
}

/** The sender address, under either name. EMAIL_FROM is preferred. */
function senderSecret(): string | undefined {
  return Deno.env.get('EMAIL_FROM') ?? Deno.env.get('MAIL_FROM')
}

// denomailer validates `from` against its own regex before opening a connection,
// and that regex is narrower than what a mail server will actually accept. Two
// differences bite in practice: in the `Name <mailbox>` form the first domain
// label may not contain a hyphen, and nothing may sit outside the angle brackets
// — a value that picked up wrapping quotes or a trailing newline on its way into
// the secret store fails too. When it refuses it throws, with a message naming
// no variable: "The specified from adress is not a valid email adress."
const BARE_MAILBOX = /^[^<>()[\]\\,;:\s@"]+@[a-zA-Z0-9-]+\.([a-zA-Z0-9-]+\.)*[a-zA-Z]{2,}$/
const NAMED_MAILBOX =
  /^[^<>]+ <[^<>()[\]\\,;:\s@"]+@[a-zA-Z0-9]+\.([a-zA-Z0-9-]+\.)*[a-zA-Z]{2,}>$/

/**
 * Turns whatever the sender secret holds into something denomailer will accept,
 * or null if there is no address in it at all.
 *
 * A display name is a nicety; the send is not. So the name is kept only when the
 * full form passes, and dropped in favour of the bare address when it does not.
 */
function normalizeFrom(raw: string): string | null {
  // Wrapping quotes survive several routes into a secret store — `secrets set
  // EMAIL_FROM="..."` through a shell that does not strip them, a .env line
  // pasted with its quotes, a dashboard field filled from either.
  const value = raw.trim().replace(/^["']|["']$/g, '').trim()

  const bracketed = value.match(/^(.*?)\s*<\s*([^<>]+?)\s*>$/)
  const address = (bracketed ? bracketed[2] : value).trim()
  const name = bracketed ? bracketed[1].trim() : ''

  if (!BARE_MAILBOX.test(address)) return null

  const named = `${name} <${address}>`
  return name && NAMED_MAILBOX.test(named) ? named : address
}

/**
 * Well inside the platform's per-request budget, so the function reports its own
 * failure rather than being killed while holding an open socket.
 */
const SMTP_TIMEOUT_MS = 20_000

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: number | undefined
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms)
    }),
  ])
}

async function sendViaSmtp(payload: Payload): Promise<SendResult> {
  const hostname = Deno.env.get('SMTP_HOST')
  const username = Deno.env.get('SMTP_USER')
  const password = Deno.env.get('SMTP_PASS')
  const from = senderSecret()

  if (!hostname || !username || !password || !from) {
    return {
      ok: false,
      error: 'SMTP is not configured (SMTP_HOST, SMTP_USER, SMTP_PASS or EMAIL_FROM missing).',
    }
  }

  // Defaults to 465, the implicit-TLS port. 587 does not work from this runtime:
  // the connection opens, then the STARTTLS upgrade fails with
  //   BadResource: Bad resource ID at Object.startTls (ext:deno_net/02_tls.js)
  // because Deno's socket-upgrade path is unavailable here. Port 465 uses
  // connectTls from the first byte and never calls startTls at all.
  const port = Number(Deno.env.get('SMTP_PORT') ?? '465')
  if (!Number.isFinite(port) || port <= 0) {
    return { ok: false, error: `SMTP_PORT is not a valid port (${Deno.env.get('SMTP_PORT')}).` }
  }

  const sender = normalizeFrom(from)
  if (!sender) {
    // Naming the variable is the whole point of catching this here: denomailer's
    // own complaint says only that some address is invalid, which sends people
    // looking at the recipient.
    return { ok: false, error: `EMAIL_FROM is not a valid sender address (${from}).` }
  }

  // 465 is implicit TLS — the socket is encrypted before the greeting, via
  // connectTls. Every other port starts in the clear and is upgraded with
  // STARTTLS, which is the path that fails in this runtime (see above). Use 465
  // here; `tls: true` on 587 is not a workaround, it fails to connect at all.
  const target = `${hostname}:${port}`
  const client = new SMTPClient({
    connection: { hostname, port, tls: port === 465, auth: { username, password } },
  })

  try {
    console.log(`SMTP connecting to ${target} (tls=${port === 465})`)
    // denomailer has no connect timeout of its own, and an SMTP handshake that
    // hangs will run until the platform kills the worker — which returns a 503
    // with no CORS headers and no log line, i.e. the least diagnosable failure
    // available. Losing the race leaves the socket dangling; the worker is torn
    // down shortly after regardless, and a named error beats a killed worker.
    await withTimeout(
      client.send({
        from: sender,
        to: payload.to,
        subject: payload.subject,
        content: payload.text ?? stripHtml(payload.html),
        html: payload.html,
      }),
      SMTP_TIMEOUT_MS,
      `No response from ${target} within ${SMTP_TIMEOUT_MS / 1000}s`,
    )
    // SMTP has no message id to hand back the way an HTTP API does; the accepted
    // send is the whole of the receipt.
    console.log(`SMTP delivered to ${payload.to} via ${target}`)
    return { ok: true }
  } catch (err) {
    console.error(`SMTP delivery failed via ${target}`, err)
    const reason = err instanceof Error ? err.message : 'The SMTP server rejected the message.'
    // The target is appended because a bare "Connection refused" is
    // unattributable — it reads the same whether the secret failed to update,
    // the host is wrong, or the port is blocked, and those differ in their fix.
    return { ok: false, error: `${reason} (connecting to ${target})` }
  } finally {
    // Never allowed to mask a successful send: a server that accepted the message
    // and then hung up on QUIT has still delivered it. A throw here would replace
    // the return value above, which is how a clean failure became an opaque 500.
    try {
      await client.close()
    } catch {
      // Nothing to do — the message is already out.
    }
  }
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/**
 * One retry, because a transient 5xx from a mail API is common and the caller
 * has already committed the database change that this message describes.
 */
async function sendViaResend(payload: Payload): Promise<SendResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = senderSecret()

  if (!apiKey || !from) {
    return { ok: false, error: 'Email is not configured (RESEND_API_KEY or EMAIL_FROM missing).' }
  }

  const body = JSON.stringify({
    from,
    to: [payload.to],
    subject: payload.subject,
    html: payload.html,
    text: payload.text ?? stripHtml(payload.html),
  })

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body,
      })

      if (response.ok) {
        const json = (await response.json()) as { id?: string }
        return { ok: true, providerId: json.id }
      }

      // 4xx is our mistake — a bad address or a malformed body. Retrying will not help.
      if (response.status < 500) {
        return { ok: false, error: `Provider rejected the message (${response.status}).` }
      }
    } catch (err) {
      if (attempt === 1) {
        return { ok: false, error: err instanceof Error ? err.message : 'Network error.' }
      }
    }
  }

  return { ok: false, error: 'The email provider was unreachable.' }
}

/** Last-resort plain-text part for callers that send only HTML. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h1|h2|h3|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim()
}

/**
 * The one place a transport is chosen.
 *
 * SMTP wins when SMTP_HOST is set, because configuring a host is a deliberate
 * act and the alternative — a precedence rule nobody can remember — is how mail
 * ends up going out from the wrong sender for a month before anyone notices.
 * Resend stays as the fallback so the HTTP path needs no code change to adopt.
 */
async function deliver(payload: Payload): Promise<SendResult> {
  return Deno.env.get('SMTP_HOST')
    ? await sendViaSmtp(payload)
    : await sendViaResend(payload)
}

/**
 * Writes the queued log row, delivers, then records the outcome on that row.
 * Shared by the staff path and the public application receipt.
 */
async function sendAndLog(admin: SupabaseClient, body: Payload): Promise<SendResult> {
  const { data: log } = await admin
    .from('email_logs')
    .insert({
      to_email: body.to,
      subject: body.subject,
      template: body.template ?? null,
      entity_type: body.entity_type ?? null,
      entity_id: body.entity_id ?? null,
      status: 'queued',
    })
    .select('id')
    .single()

  const result = await deliver(body)

  if (log?.id) {
    await admin
      .from('email_logs')
      .update({
        status: result.ok ? 'sent' : 'failed',
        provider_id: result.providerId ?? null,
        error_message: result.error ?? null,
        sent_at: result.ok ? new Date().toISOString() : null,
      })
      .eq('id', log.id)
  }

  return result
}

// ---------- public: application receipt ----------
// The one thing an anonymous caller may ask for: "email my reference number to
// the address on my application". It is NOT an open relay, because the caller
// controls neither half of the message —
//   * the recipient is read from the applicant row, never taken from the body;
//   * the content is built here from a fixed template, never taken from the body;
// and it is bounded: the caller must know both the applicant id and the
// reference number (only the submitter has both), the application must be less
// than RECEIPT_WINDOW_MS old, and a successful send is never repeated.

const RECEIPT_TEMPLATE = 'applicant_received'
const RECEIPT_WINDOW_MS = 60 * 60 * 1000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface ReceiptRequest {
  kind: 'application_received'
  applicant_id?: unknown
  reference_no?: unknown
}

function isReceiptRequest(body: unknown): body is ReceiptRequest {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { kind?: unknown }).kind === 'application_received'
  )
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Bare address out of `Name <addr>`, for the "write to us" line. */
function bareAddress(value: string | undefined): string | null {
  if (!value) return null
  const cleaned = value.trim().replace(/^["']|["']$/g, '').trim()
  const match = cleaned.match(/<\s*([^<>]+?)\s*>$/)
  const address = (match ? match[1] : cleaned).trim()
  return BARE_MAILBOX.test(address) ? address : null
}

/**
 * Mirrors the layout in src/features/applicants/utils/emailTemplates.ts — this
 * function is self-contained and cannot import it. Keep the two in step.
 *
 * APP_NAME and SUPPORT_EMAIL are optional secrets; without them the name falls
 * back to the agency's and the support address to the sender's.
 */
function buildReceiptEmail(params: {
  firstName: string
  referenceNo: string
  positionName: string | null
  statusUrl: string | null
}): { subject: string; html: string; text: string } {
  const appName = Deno.env.get('APP_NAME') ?? 'Aloha Security Agency'
  const support =
    Deno.env.get('SUPPORT_EMAIL') ?? bareAddress(senderSecret()) ?? 'recruitment@alohasecurity.ph'
  const { firstName, referenceNo, positionName, statusUrl } = params

  const BRAND = '#0f172a'
  const MUTED = '#64748b'
  const BORDER = '#e2e8f0'
  const p = (text: string) =>
    `<p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#334155;">${text}</p>`

  const role = positionName ? ` for the <strong>${esc(positionName)}</strong> position` : ''
  const roleText = positionName ? ` for the ${positionName} position` : ''
  const statusLine = statusUrl
    ? `Keep this email. You can check the progress of your application at any time on our <a href="${esc(statusUrl)}" style="color:${BRAND};">status page</a> using this reference number and your surname.`
    : 'Keep this email. You can check the progress of your application at any time on our status page using this reference number and your surname.'

  const html = `
<div style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">
    <div style="padding:20px 28px;border-bottom:1px solid ${BORDER};">
      <span style="font-size:15px;font-weight:700;color:${BRAND};">${esc(appName)}</span>
    </div>
    <div style="padding:28px;">
      <h1 style="margin:0 0 16px;font-size:19px;line-height:1.35;color:${BRAND};">We have received your application</h1>
      ${p(`Hello ${esc(firstName)},`)}
      ${p(`Thank you for applying to ${esc(appName)}${role}. Your application has been recorded and will be reviewed by our recruitment team.`)}
      <div style="margin:0 0 14px;padding:14px 16px;background:#f1f5f9;border-left:3px solid ${BRAND};border-radius:6px;">
        <div style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};">Your reference number</div>
        <div style="margin-top:4px;font-size:20px;font-weight:700;color:${BRAND};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${esc(referenceNo)}</div>
      </div>
      ${p(statusLine)}
      ${p('We will email you again when there is an update. No action is needed from you in the meantime.')}
    </div>
    <div style="padding:18px 28px;border-top:1px solid ${BORDER};background:#f8fafc;">
      <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};">
        Quote your reference number in any reply. Questions? Write to
        <a href="mailto:${esc(support)}" style="color:${BRAND};">${esc(support)}</a>.
      </p>
      <p style="margin:12px 0 0;font-size:11px;color:${MUTED};">
        This message was sent automatically — please do not treat it as an offer of employment.
      </p>
    </div>
  </div>
</div>`.trim()

  const text = [
    `Hello ${firstName},`,
    '',
    `Thank you for applying to ${appName}${roleText}. Your application has been recorded and will be reviewed by our recruitment team.`,
    '',
    `Your reference number: ${referenceNo}`,
    '',
    statusUrl
      ? `Keep this email. You can check the progress of your application at any time at ${statusUrl} using this reference number and your surname.`
      : 'Keep this email. You can check the progress of your application at any time on our status page using this reference number and your surname.',
    '',
    'We will email you again when there is an update. No action is needed from you in the meantime.',
    '',
    `Questions? Write to ${support}`,
    '',
    appName,
  ].join('\n')

  return { subject: `Application received — ${referenceNo}`, html, text }
}

async function handleReceipt(body: ReceiptRequest, origin: string | null): Promise<Response> {
  const applicantId = typeof body.applicant_id === 'string' ? body.applicant_id : ''
  const referenceNo = typeof body.reference_no === 'string' ? body.reference_no.trim() : ''

  if (!UUID_RE.test(applicantId) || !referenceNo) {
    throw new HttpError(400, 'applicant_id and reference_no are required')
  }

  const admin = adminClient()

  const { data: applicant } = await admin
    .from('applicants')
    .select('id, first_name, email, reference_no, position_id, created_at')
    .eq('id', applicantId)
    .maybeSingle()

  // One answer for "no such id" and "wrong reference", so the endpoint cannot be
  // used to probe which ids exist.
  if (!applicant || applicant.reference_no !== referenceNo) {
    throw new HttpError(404, 'Application not found')
  }

  if (Date.now() - new Date(applicant.created_at).getTime() > RECEIPT_WINDOW_MS) {
    throw new HttpError(403, 'The confirmation email for this application can no longer be requested')
  }

  const meta = {
    template: RECEIPT_TEMPLATE,
    entity_type: 'applicant',
    entity_id: applicant.id as string,
    dedupe: true,
  }

  if (await alreadySent(admin, { ...meta, to: '', subject: '', html: '' })) {
    return jsonResponse({ sent: false, skipped: true, error: null }, 200, origin)
  }

  let positionName: string | null = null
  if (applicant.position_id) {
    const { data: position } = await admin
      .from('positions')
      .select('name')
      .eq('id', applicant.position_id)
      .maybeSingle()
    positionName = position?.name ?? null
  }

  // Link back to the site the applicant actually used, but only when it is one
  // we serve — the Origin header is caller-supplied.
  const statusUrl = origin && allowedOrigins().includes(origin) ? `${origin}/status` : null

  const email = buildReceiptEmail({
    firstName: applicant.first_name,
    referenceNo: applicant.reference_no,
    positionName,
    statusUrl,
  })

  const result = await sendAndLog(admin, { ...meta, to: applicant.email, ...email })

  // The provider's error text is for the logs (email_logs.error_message), not
  // for an anonymous browser.
  return jsonResponse(
    { sent: result.ok, skipped: false, error: result.ok ? null : 'Email could not be sent' },
    result.ok ? 200 : 502,
    origin,
  )
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  const origin = req.headers.get('origin')

  try {
    const raw: unknown = await req.json().catch(() => null)

    // The only unauthenticated path. Everything below it requires staff.
    if (isReceiptRequest(raw)) return await handleReceipt(raw, origin)

    await requireCaller(req, [
      'owner',
      'admin',
      'system_administrator',
      'hr_staff',
      'recruitment_officer',
    ])
    const body = raw as Payload

    if (!body?.to || !body?.subject || !body?.html) {
      throw new HttpError(400, 'to, subject and html are required')
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.to)) {
      throw new HttpError(400, 'Invalid recipient address')
    }

    const admin = adminClient()

    // Checked before the queued row is written, so a suppressed send leaves no
    // trace that would itself look like a delivery attempt.
    if (await alreadySent(admin, body)) {
      return jsonResponse({ sent: false, skipped: true, error: null }, 200, origin)
    }

    const result = await sendAndLog(admin, body)

    return jsonResponse(
      { sent: result.ok, skipped: false, error: result.error ?? null },
      result.ok ? 200 : 502,
      origin,
    )
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500
    const message = err instanceof Error ? err.message : 'Unexpected error'

    // The generic body is deliberate — internals are not for the browser — but
    // without this line a 500 leaves no trace anywhere and cannot be diagnosed.
    // Visible under Edge Functions → Logs.
    if (status === 500) console.error('send-notification-email failed', err)

    return jsonResponse(
      { error: status === 500 ? 'Internal error' : message },
      status,
      origin,
    )
  }
})
