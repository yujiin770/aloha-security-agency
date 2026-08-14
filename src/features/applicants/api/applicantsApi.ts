import { supabase, BUCKETS, SIGNED_URL_TTL_SECONDS } from '@/lib/supabase'
import { toAppError, AppError } from '@/lib/errors'
import { DOCUMENT_BUCKETS, MAX_UPLOAD_BYTES } from '@/utils/constants'
import type {
  ApplicantDocumentRow,
  ApplicantRow,
  ApplicantStatus,
  ApplicantStatusHistoryRow,
  ApplicantSummaryView,
  ApplicationReceipt,
  ApplicationStatusResult,
  DocumentType,
  Json,
  PersonnelRow,
} from '@/types/database.types'
import type {
  ApplicationFormValues,
} from '../schemas/applicationSchema'
import { toApplicantInsert } from '../schemas/applicationSchema'
import { buildStatusEmail } from '../utils/emailTemplates'

/* -------------------------------------------------------------------------- */
/* Public: submission and status                                              */
/* -------------------------------------------------------------------------- */

const SUBMIT_TIMEOUT_MS = 30_000

/**
 * Submits a public application.
 *
 * `submissionId` is an idempotency key generated once per filled-in form. If a
 * submit times out on a bad connection, the applicant has no way of knowing
 * whether the row was written before the socket died — so the retry sends the
 * same key and the RPC returns the existing receipt instead of creating a
 * duplicate applicant.
 *
 * Goes through the `submit_application` RPC (migration 0017) rather than a
 * direct insert. A direct `.insert().select()` cannot work for `anon`:
 * PostgreSQL applies the table's SELECT policies to an INSERT's RETURNING
 * clause, and `anon` has no SELECT policy on `applicants` by design, so the
 * round trip failed with 42501 even though the row itself was allowed. The RPC
 * runs SECURITY DEFINER and hands back only the id and reference number.
 */
export async function submitApplication(
  values: ApplicationFormValues,
  options: { submissionId?: string; timeoutMs?: number } = {},
): Promise<ApplicationReceipt> {
  const { submissionId, timeoutMs = SUBMIT_TIMEOUT_MS } = options

  // Without this, a submit made as the connection dies sits on a socket that
  // will never answer while the button spins — the browser's own timeout is
  // minutes long. Failing at 30s lets the form offer a retry while the
  // applicant is still looking at it.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const { data, error } = await supabase
      .rpc('submit_application', {
        p_payload: toApplicantInsert(values) as unknown as Json,
        p_submission_id: submissionId ?? null,
      })
      .abortSignal(controller.signal)

    if (error) throw toAppError(error, 'Could not submit your application.')

    const receipt = data?.[0]
    if (!receipt) {
      throw new AppError('Your application was not recorded. Please try again.')
    }
    return receipt
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AppError(
        'The server did not respond in time. Check your connection and try again.',
        'NETWORK',
        error,
      )
    }
    throw toAppError(error, 'Could not submit your application.')
  } finally {
    clearTimeout(timer)
  }
}

export async function checkApplicationStatus(
  referenceNo: string,
  lastName: string,
): Promise<ApplicationStatusResult | null> {
  const { data, error } = await supabase.rpc('check_application_status', {
    p_reference_no: referenceNo.trim(),
    p_last_name: lastName.trim(),
  })

  if (error) throw toAppError(error, 'Could not look up that application.')
  return data?.[0] ?? null
}

/* -------------------------------------------------------------------------- */
/* Documents                                                                   */
/* -------------------------------------------------------------------------- */

function extensionOf(fileName: string): string {
  const parts = fileName.split('.')
  return parts.length > 1 ? (parts.pop() ?? 'bin').toLowerCase() : 'bin'
}

/**
 * Uploads a document and records it.
 *
 * The object key is `{applicant_id}/{type}-{uuid}.{ext}`; the storage policies
 * in 0010 key on that leading folder, so the path is not cosmetic — it is what
 * authorises the write. The original filename is stored as metadata rather than
 * used as the key, since user-supplied names are an injection surface.
 *
 * Nothing is selected back. This runs for anonymous submitters, who may INSERT
 * into `applicant_documents` but never SELECT from it — and a RETURNING clause
 * is subject to the SELECT policies, so asking for the row back would fail the
 * whole write with 42501. No caller needs the row.
 */
export async function uploadApplicantDocument(params: {
  applicantId: string
  documentType: DocumentType
  file: File
}): Promise<void> {
  const { applicantId, documentType, file } = params

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new AppError('That file is larger than the 10 MB limit.')
  }

  const bucketId = DOCUMENT_BUCKETS[documentType] ?? BUCKETS.certificates
  const path = `${applicantId}/${documentType}-${crypto.randomUUID()}.${extensionOf(file.name)}`

  const { error: uploadError } = await supabase.storage
    .from(bucketId)
    .upload(path, file, { cacheControl: '3600', upsert: false })

  if (uploadError) throw toAppError(uploadError, 'Could not upload that file.')

  const { error } = await supabase
    .from('applicant_documents')
    .insert({
      applicant_id: applicantId,
      document_type: documentType,
      bucket_id: bucketId,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: null,
      verified_by: null,
      verified_at: null,
      notes: null,
    })

  if (error) {
    // Don't leave an orphaned object behind if the metadata row fails.
    await supabase.storage.from(bucketId).remove([path])
    throw toAppError(error, 'Could not save that document.')
  }
}

export async function listApplicantDocuments(
  applicantId: string,
): Promise<ApplicantDocumentRow[]> {
  const { data, error } = await supabase
    .from('applicant_documents')
    .select('*')
    .eq('applicant_id', applicantId)
    .order('created_at', { ascending: false })

  if (error) throw toAppError(error, 'Could not load documents.')
  return data ?? []
}

/**
 * Mints a short-lived signed URL for a private document.
 *
 * Private buckets have no public URL at all — this is the only read path, and
 * the 60-second TTL means a copied link is useless almost immediately.
 */
export async function getDocumentUrl(doc: ApplicantDocumentRow): Promise<string> {
  const { data, error } = await supabase.storage
    .from(doc.bucket_id)
    .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS)

  if (error) throw toAppError(error, 'Could not open that document.')
  return data.signedUrl
}

export async function deleteApplicantDocument(
  doc: ApplicantDocumentRow,
): Promise<void> {
  const { error } = await supabase
    .from('applicant_documents')
    .delete()
    .eq('id', doc.id)

  if (error) throw toAppError(error, 'Could not delete that document.')
  await supabase.storage.from(doc.bucket_id).remove([doc.storage_path])
}

export async function verifyDocument(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('applicant_documents')
    .update({ verified_by: userId, verified_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw toAppError(error, 'Could not verify that document.')
}

/* -------------------------------------------------------------------------- */
/* Admin: listing and pipeline                                                 */
/* -------------------------------------------------------------------------- */

export interface ApplicantListParams {
  search?: string
  status?: ApplicantStatus | ''
  /** A `positions.id`, not an enum value. */
  positionId?: string
  branchId?: string
  page: number
  pageSize: number
  sortColumn?: string
  sortDirection?: 'asc' | 'desc'
}

export interface Paginated<T> {
  rows: T[]
  total: number
}

export async function listApplicants(
  params: ApplicantListParams,
): Promise<Paginated<ApplicantSummaryView>> {
  const {
    search,
    status,
    positionId,
    branchId,
    page,
    pageSize,
    sortColumn = 'created_at',
    sortDirection = 'desc',
  } = params

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('v_applicant_summary')
    .select('*', { count: 'exact' })
    .order(sortColumn, { ascending: sortDirection === 'asc' })
    .range(from, to)

  if (status) query = query.eq('status', status)
  if (positionId) query = query.eq('position_id', positionId)
  if (branchId) query = query.eq('preferred_branch_id', branchId)

  if (search?.trim()) {
    const term = search.trim()
    // `or` with ilike across the searchable columns. The term is passed as a
    // parameter by the client library, so it is not string-concatenated into SQL.
    query = query.or(
      `full_name.ilike.%${term}%,reference_no.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`,
    )
  }

  const { data, error, count } = await query
  if (error) throw toAppError(error, 'Could not load applicants.')

  return { rows: data ?? [], total: count ?? 0 }
}

export async function getApplicant(id: string): Promise<ApplicantRow> {
  const { data, error } = await supabase
    .from('applicants')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw toAppError(error, 'Could not load that applicant.')
  return data
}

export async function getApplicantHistory(
  id: string,
): Promise<ApplicantStatusHistoryRow[]> {
  const { data, error } = await supabase
    .from('applicant_status_history')
    .select('*')
    .eq('applicant_id', id)
    .order('created_at', { ascending: false })

  if (error) throw toAppError(error, 'Could not load the status history.')
  return data ?? []
}

/* -------------------------------------------------------------------------- */
/* Applicant notifications                                                     */
/* -------------------------------------------------------------------------- */

export type NotifyOutcome =
  /** Delivered to the mail server. */
  | { state: 'sent' }
  /** Suppressed: this template already went out for this applicant. */
  | { state: 'skipped' }
  /** No template exists for this status — pending, hired, archived. */
  | { state: 'not-applicable' }
  | { state: 'failed'; reason: string }

/**
 * Emails an applicant about a status change.
 *
 * Never throws. The status change has already been committed by the time this
 * runs, so a mail failure must not surface as a failed status change — that
 * would tell staff to retry an update that in fact succeeded. The outcome is
 * returned instead so the caller can report it accurately, and every attempt is
 * recorded in `email_logs` by the Edge Function regardless.
 */
export async function notifyApplicantOfStatus(
  applicant: ApplicantRow,
  status: ApplicantStatus,
): Promise<NotifyOutcome> {
  const email = buildStatusEmail(applicant, status)
  if (!email) return { state: 'not-applicable' }

  try {
    const { data, error } = await supabase.functions.invoke<{
      sent: boolean
      skipped?: boolean
      error: string | null
    }>('send-notification-email', {
      body: {
        to: applicant.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        template: email.template,
        entity_type: 'applicant',
        entity_id: applicant.id,
        dedupe: true,
      },
    })

    if (error) {
      // supabase-js collapses every non-2xx into a generic FunctionsHttpError
      // whose message is "Edge Function returned a non-2xx status code" — the
      // actual cause ("connection refused", "authentication failed") is in the
      // response body, which it hangs off `context`. Without this, every mail
      // problem looks identical and is undiagnosable from the UI.
      return { state: 'failed', reason: await functionErrorText(error) }
    }
    if (data?.skipped) return { state: 'skipped' }
    if (!data?.sent) {
      return { state: 'failed', reason: data?.error ?? 'The mail server rejected the message.' }
    }
    return { state: 'sent' }
  } catch (err) {
    return { state: 'failed', reason: errorText(err) }
  }
}

function errorText(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  return 'The notification service could not be reached.'
}

/**
 * Pulls the useful message out of a Functions error.
 *
 * `FunctionsHttpError` carries the original `Response` on `context`; the body is
 * this function's own `{ error }` payload, which names the real cause. The body
 * can only be read once, so failures to parse fall back to the generic message
 * rather than throwing over the top of the error being reported.
 */
async function functionErrorText(err: unknown): Promise<string> {
  const context = (err as { context?: unknown })?.context
  if (context instanceof Response) {
    try {
      const body = (await context.clone().json()) as { error?: string } | null
      if (body?.error) return body.error
    } catch {
      // Not JSON, or already consumed — fall through to the generic message.
    }
  }
  return errorText(err)
}

export async function updateApplicantStatus(params: {
  id: string
  status: ApplicantStatus
  rejectionReason?: string
  interviewAt?: string | null
  note?: string
  /** When false, the applicant is not emailed about this change. */
  notify?: boolean
}): Promise<{ applicant: ApplicantRow; notification: NotifyOutcome }> {
  const patch: Partial<ApplicantRow> = { status: params.status }

  if (params.status === 'rejected') {
    patch.rejection_reason = params.rejectionReason ?? 'Not specified'
  }
  if (params.interviewAt !== undefined) {
    patch.interview_at = params.interviewAt
  }
  if (params.note) {
    patch.interview_notes = params.note
  }

  const { data, error } = await supabase
    .from('applicants')
    .update(patch)
    .eq('id', params.id)
    .select()
    .single()

  // The database validates the transition itself (validate_applicant_transition
  // in 0007); an illegal move surfaces here as a readable exception message.
  if (error) throw toAppError(error, 'Could not update the applicant.')

  // Sent from the returned row, not the patch: `interview_at` may have been set
  // on an earlier save, and the email must quote what is actually stored.
  const notification =
    params.notify === false
      ? ({ state: 'not-applicable' } as NotifyOutcome)
      : await notifyApplicantOfStatus(data, params.status)

  return { applicant: data, notification }
}

export async function updateApplicant(
  id: string,
  patch: Partial<ApplicantRow>,
): Promise<ApplicantRow> {
  const { data, error } = await supabase
    .from('applicants')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw toAppError(error, 'Could not save your changes.')
  return data
}

/** Calls the transactional hire function — never inserts personnel directly. */
export async function hireApplicant(params: {
  applicantId: string
  dateHired?: string
  rankId?: string
}): Promise<PersonnelRow> {
  const { data, error } = await supabase.rpc('promote_applicant_to_personnel', {
    p_applicant_id: params.applicantId,
    ...(params.dateHired ? { p_date_hired: params.dateHired } : {}),
    ...(params.rankId ? { p_rank_id: params.rankId } : {}),
  })

  if (error) throw toAppError(error, 'Could not onboard this applicant.')
  return data
}

export async function bulkUpdateStatus(
  ids: string[],
  status: ApplicantStatus,
  rejectionReason?: string,
  options: { notify?: boolean } = {},
): Promise<{ updated: number; sent: number; failed: number }> {
  const patch: Partial<ApplicantRow> = { status }
  if (status === 'rejected') {
    patch.rejection_reason = rejectionReason ?? 'Not specified'
  }

  // `.select()` is required, not cosmetic: the updated rows carry the addresses
  // and reference numbers the emails are built from.
  const { data, error } = await supabase
    .from('applicants')
    .update(patch)
    .in('id', ids)
    .select()

  if (error) throw toAppError(error, 'Could not update the selected applicants.')

  const rows = data ?? []
  if (options.notify === false) {
    return { updated: rows.length, sent: 0, failed: 0 }
  }

  // Sequential rather than Promise.all: SMTP opens a connection per message and
  // most providers throttle or drop parallel bursts from one mailbox.
  let sent = 0
  let failed = 0
  for (const row of rows) {
    const outcome = await notifyApplicantOfStatus(row, status)
    if (outcome.state === 'sent') sent += 1
    else if (outcome.state === 'failed') failed += 1
  }

  return { updated: rows.length, sent, failed }
}
