import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  Eye,
  FileImage,
  FileText,
  Mail,
  Phone,
  RotateCcw,
  ScanSearch,
  UserPlus,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { ErrorState, LoadingState, Skeleton } from '@/components/ui/Feedback'
import { ImageViewer } from '@/components/ui/ImageViewer'
import { useToast } from '@/components/ui/Toast'
import { Can } from '@/app/guards'
import { queryKeys } from '@/lib/queryKeys'
import { errorMessage } from '@/lib/errors'
import { useAuth } from '@/contexts/AuthContext'
import {
  getApplicant,
  getApplicantHistory,
  getDocumentUrl,
  hireApplicant,
  listApplicantDocuments,
  notifyApplicantOfStatus,
  updateApplicantStatus,
  verifyDocument,
} from '@/features/applicants/api/applicantsApi'
import type { NotifyOutcome } from '@/features/applicants/api/applicantsApi'
import {
  APPLICANT_TRANSITIONS,
  applicantStatusMeta,
  documentTypeMeta,
  sortByPipeline,
  ADMIN_ROLES,
} from '@/utils/constants'
import {
  usePositionLookup,
  useRanksForPosition,
} from '@/features/config/hooks/useConfig'
import {
  calculateAge,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatFileSize,
  fullName,
  humanize,
  maskId,
} from '@/utils/format'
import { formatFeetInches, formatPounds } from '@/utils/units'
import { useStateDraft } from '@/hooks/useStateDraft'
import { DraftNotice } from '@/components/ui/DraftNotice'
import type { ApplicantDocumentRow, ApplicantStatus } from '@/types/database.types'

/**
 * How each pipeline move is offered. The verbs say what the click does, and the
 * icon plus variant set the consequential moves apart from routine ones.
 */
const MOVE_ACTIONS: Record<
  ApplicantStatus,
  { label: string; icon: LucideIcon; variant: 'primary' | 'secondary' | 'danger' | 'ghost' }
> = {
  pending: { label: 'Return to Pending', icon: RotateCcw, variant: 'ghost' },
  screening: { label: 'Move to Screening', icon: ScanSearch, variant: 'secondary' },
  interview: { label: 'Schedule Interview', icon: CalendarClock, variant: 'primary' },
  hired: { label: 'Mark as Hired', icon: UserPlus, variant: 'primary' },
  rejected: { label: 'Reject Application', icon: XCircle, variant: 'danger' },
  archived: { label: 'Archive Applicant', icon: Archive, variant: 'ghost' },
}

const isImage = (doc: ApplicantDocumentRow) =>
  doc.mime_type?.startsWith('image/') ?? /\.(jpe?g|png|webp|gif)$/i.test(doc.file_name)

/**
 * Statuses `buildStatusEmail` produces a template for. Kept in step with it —
 * offering the checkbox for a status that sends nothing would be a lie.
 */
const NOTIFIABLE: ApplicantStatus[] = ['screening', 'interview', 'rejected', 'hired']

export default function ApplicantDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const { user } = useAuth()

  const [statusTarget, setStatusTarget] = useState<ApplicantStatus | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [interviewAt, setInterviewAt] = useState('')
  const [note, setNote] = useState('')
  const [notify, setNotify] = useState(true)
  const [hireOpen, setHireOpen] = useState(false)
  const [rankId, setRankId] = useState('')

  const applicant = useQuery({
    queryKey: queryKeys.applicants.detail(id),
    queryFn: () => getApplicant(id),
    enabled: Boolean(id),
  })

  const positionLookup = usePositionLookup()
  // Only the ranks configured for this applicant's position are offered.
  const availableRanks = useRanksForPosition(applicant.data?.position_id)

  const documents = useQuery({
    queryKey: queryKeys.applicants.documents(id),
    queryFn: () => listApplicantDocuments(id),
    enabled: Boolean(id),
  })

  const history = useQuery({
    queryKey: queryKeys.applicants.history(id),
    queryFn: () => getApplicantHistory(id),
    enabled: Boolean(id),
  })

  const changeStatus = useMutation({
    mutationFn: () =>
      updateApplicantStatus({
        id,
        status: statusTarget!,
        rejectionReason: rejectionReason.trim() || undefined,
        interviewAt: statusTarget === 'interview' && interviewAt ? interviewAt : undefined,
        note: note.trim() || undefined,
        notify,
      }),
    onSuccess: ({ applicant: updated, notification }) => {
      const moved = `${updated.reference_no} moved to ${humanize(updated.status)}.`

      // The status change succeeded either way, so a failed email is a warning
      // rather than an error — but it must be said. Silently swallowing it is
      // how staff end up believing an applicant was told when they were not.
      if (notification.state === 'failed') {
        toast.warning(
          'Status updated — email not sent',
          `${moved} The applicant was not notified: ${notification.reason}`,
        )
      } else if (notification.state === 'sent') {
        toast.success('Status updated', `${moved} ${updated.email} has been notified.`)
      } else if (notification.state === 'skipped') {
        toast.success(
          'Status updated',
          `${moved} No email sent — the applicant was already notified of this stage.`,
        )
      } else {
        toast.success('Status updated', moved)
      }

      closeStatusDialog()
      void qc.invalidateQueries({ queryKey: queryKeys.applicants.all })
    },
    onError: (error) => toast.error('Could not update status', errorMessage(error)),
  })

  const hire = useMutation({
    // This path does not go through updateApplicantStatus — the RPC moves the
    // applicant to `hired` itself — so the notification has to be sent here or
    // the one status change that most warrants an email would be the only one
    // that never sent one.
    mutationFn: async () => {
      const person = await hireApplicant({ applicantId: id, rankId: rankId || undefined })
      const applicantRow = applicant.data
      const notification =
        notify && applicantRow
          ? await notifyApplicantOfStatus(applicantRow, 'hired')
          : ({ state: 'not-applicable' } as NotifyOutcome)
      return { person, notification }
    },
    onSuccess: ({ person, notification }) => {
      const onboarded = `${fullName(person)} added to the roster as ${person.employee_no}.`

      if (notification.state === 'failed') {
        toast.warning(
          'Onboarded — email not sent',
          `${onboarded} The applicant was not notified: ${notification.reason}`,
        )
      } else if (notification.state === 'sent') {
        toast.success('Applicant onboarded', `${onboarded} A welcome email has been sent.`)
      } else {
        toast.success('Applicant onboarded', onboarded)
      }

      setHireOpen(false)
      void qc.invalidateQueries({ queryKey: queryKeys.applicants.all })
      void qc.invalidateQueries({ queryKey: queryKeys.personnel.all })
      navigate(`/admin/personnel/${person.id}`)
    },
    onError: (error) => toast.error('Could not onboard applicant', errorMessage(error)),
  })

  const verify = useMutation({
    mutationFn: (documentId: string) => verifyDocument(documentId, user!.id),
    onSuccess: () => {
      toast.success('Document verified')
      void qc.invalidateQueries({ queryKey: queryKeys.applicants.documents(id) })
    },
    onError: (error) => toast.error('Could not verify document', errorMessage(error)),
  })

  // Memoised so the status dialog's `onClose` keeps a stable identity across
  // the re-render every keystroke in the note field causes.
  const closeStatusDialog = useCallback(() => {
    setStatusTarget(null)
    setRejectionReason('')
    setInterviewAt('')
    setNote('')
    setNotify(true)
  }, [])

  const closeHireDialog = useCallback(() => {
    setHireOpen(false)
    setNotify(true)
  }, [])

  // Unsaved dialog input survives a refresh: the dialog reopens with it. Ids
  // are scoped by applicant so drafts for different applicants never collide,
  // and a draft is dropped if the applicant has since moved on and the action
  // no longer applies.
  const statusDraft = useStateDraft({
    id: `applicant.status:${id}`,
    open: statusTarget !== null,
    recordId: statusTarget,
    values: { rejectionReason, interviewAt, note, notify },
    apply: (v) => {
      if (v.rejectionReason !== undefined) setRejectionReason(v.rejectionReason)
      if (v.interviewAt !== undefined) setInterviewAt(v.interviewAt)
      if (v.note !== undefined) setNote(v.note)
      if (v.notify !== undefined) setNotify(v.notify)
    },
    ready: applicant.isSuccess,
    onResume: (target) => {
      const current = applicant.data?.status
      const move = target as ApplicantStatus | null
      if (!current || !move || move === 'hired') return false
      if (!APPLICANT_TRANSITIONS[current].includes(move)) return false
      setStatusTarget(move)
    },
  })

  const hireDraft = useStateDraft({
    id: `applicant.hire:${id}`,
    open: hireOpen,
    recordId: id,
    values: { rankId, notify },
    apply: (v) => {
      if (v.rankId !== undefined) setRankId(v.rankId)
      if (v.notify !== undefined) setNotify(v.notify)
    },
    ready: applicant.isSuccess,
    onResume: () => {
      if (applicant.data?.status !== 'interview') return false
      setHireOpen(true)
    },
  })

  // Images preview in place; anything else (PDFs) opens in a new tab, where
  // the browser's own viewer does a better job than we could.
  const [preview, setPreview] = useState<{ doc: ApplicantDocumentRow; url: string | null } | null>(
    null,
  )

  async function loadPreview(doc: ApplicantDocumentRow) {
    setPreview({ doc, url: null })
    try {
      // Signed links expire after a minute, so a retry always asks for a new one.
      const url = await getDocumentUrl(doc)
      setPreview((current) => (current?.doc.id === doc.id ? { doc, url } : current))
    } catch (error) {
      setPreview(null)
      toast.error('Could not load preview', errorMessage(error))
    }
  }

  async function openDocument(docId: string) {
    const doc = documents.data?.find((d) => d.id === docId)
    if (!doc) return
    if (isImage(doc)) {
      void loadPreview(doc)
      return
    }
    try {
      const url = await getDocumentUrl(doc)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      toast.error('Could not open document', errorMessage(error))
    }
  }

  if (applicant.isLoading) return <LoadingState label="Loading applicant…" />

  if (applicant.isError || !applicant.data) {
    return (
      <Card>
        <ErrorState
          title="Applicant not found"
          message={
            applicant.error
              ? errorMessage(applicant.error)
              : 'This applicant does not exist, or you do not have access to it.'
          }
        />
        <div className="flex justify-center pb-6">
          <Link to="/admin/applicants">
            <Button variant="secondary" leftIcon={<ArrowLeft className="h-4 w-4" />}>
              Back to applicants
            </Button>
          </Link>
        </div>
      </Card>
    )
  }

  const a = applicant.data
  const statusMeta = applicantStatusMeta(a.status)
  // `hired` is deliberately not a plain status move. The database permits
  // interview -> hired, so this card used to offer it as an ordinary button —
  // and it worked, in the worst way: the applicant was marked Hired while no
  // personnel record was ever created, because only
  // promote_applicant_to_personnel() writes one. The roster stayed empty and
  // the Assign Personnel dropdown had nothing to show. Onboarding goes through
  // the Hire button and its dialog, which calls the RPC.
  const allowedMoves = sortByPipeline(
    APPLICANT_TRANSITIONS[a.status].filter((target) => target !== 'hired'),
  )

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Applicants', to: '/admin/applicants' },
          { label: a.reference_no },
        ]}
        title={fullName(a)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{a.reference_no}</span>
            <span aria-hidden="true">·</span>
            <span>{positionLookup.name(a.position_id)}</span>
            <span aria-hidden="true">·</span>
            <span>Submitted {formatDate(a.created_at)}</span>
          </span>
        }
        actions={
          <>
            <Badge tone={statusMeta?.tone ?? 'neutral'} dot>
              {statusMeta?.label}
            </Badge>
            {a.status === 'interview' && (
              <Can roles={[...ADMIN_ROLES, 'hr_staff']}>
                <Button
                  leftIcon={<UserPlus className="h-4 w-4" />}
                  onClick={() => setHireOpen(true)}
                >
                  Mark as Hired
                </Button>
              </Can>
            )}
          </>
        }
      />

      {/* Pipeline actions ------------------------------------------------- */}
      <Can roles={[...ADMIN_ROLES, 'hr_staff', 'recruitment_officer']}>
        {allowedMoves.length > 0 && (
          <Card className="mb-6">
            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-1 text-xs font-semibold tracking-wider text-[var(--app-text-muted)] uppercase">
                Recruitment actions
              </p>
              {allowedMoves.map((target) => {
                const action = MOVE_ACTIONS[target]
                return (
                  <Button
                    key={target}
                    size="sm"
                    variant={action.variant}
                    leftIcon={<action.icon className="h-3.5 w-3.5" aria-hidden="true" />}
                    onClick={() => setStatusTarget(target)}
                  >
                    {action.label}
                  </Button>
                )
              })}
            </div>

            {a.status === 'interview' && (
              <p className="mt-3 border-t border-[var(--app-border)] pt-3 text-xs text-[var(--app-text-muted)]">
                To hire, use the <strong>Mark as Hired</strong> button above — it creates
                the personnel record and employee number in the same
                transaction, which is what puts this person on the roster and
                makes them assignable to a post.
              </p>
            )}
          </Card>
        )}
      </Can>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Personal ---------------------------------------------------- */}
          <Card padded={false}>
            <CardHeader title="Personal information" />
            <DetailGrid
              items={[
                ['Full name', fullName(a)],
                ['Date of birth', `${formatDate(a.birth_date)} (${calculateAge(a.birth_date)} yrs)`],
                ['Sex', humanize(a.sex)],
                ['Civil status', humanize(a.civil_status)],
                [
                  'Height',
                  a.height_cm ? `${a.height_cm} cm (${formatFeetInches(a.height_cm)})` : '—',
                ],
                [
                  'Weight',
                  a.weight_kg ? `${a.weight_kg} kg (${formatPounds(a.weight_kg)})` : '—',
                ],
              ]}
            />
          </Card>

          {/* Address ----------------------------------------------------- */}
          <Card padded={false}>
            <CardHeader title="Address" />
            <DetailGrid
              items={[
                ['Street / house no.', a.address_line || '—'],
                ['Barangay', a.barangay || '—'],
                ['City / municipality', a.city_municipality || '—'],
                ['Province', a.province || '—'],
                ['Region', a.region || '—'],
              ]}
            />
          </Card>

          {/* Application ------------------------------------------------- */}
          <Card padded={false}>
            <CardHeader title="Application details" />
            <DetailGrid
              items={[
                ['Position applied', positionLookup.name(a.position_id)],
                ['Experience', `${a.years_experience} year(s)`],
                ['Highest education', a.highest_education ?? '—'],
                ['Expected salary', formatCurrency(a.expected_salary)],
                ['Available from', formatDate(a.availability_date)],
                ['Heard about us via', a.source ?? '—'],
              ]}
            />
          </Card>

          {/* Credentials -------------------------------------------------- */}
          <Card padded={false}>
            <CardHeader
              title="Employment background & credentials"
              description="Statutory numbers are masked — expand a record in the audit log to see a full value."
            />
            <DetailGrid
              items={[
                ['SSS', maskId(a.sss_no)],
                ['PhilHealth', maskId(a.philhealth_no)],
                ['Pag-IBIG', maskId(a.pagibig_no)],
                ['TIN', maskId(a.tin_no)],
                ['NBI clearance', a.nbi_clearance_no ?? '—'],
                ['NBI expiry', formatDate(a.nbi_clearance_expiry)],
                ['Police clearance', a.police_clearance_no ?? '—'],
                [
                  'Security licence',
                  a.is_licensed
                    ? `${a.security_license_no ?? 'Yes'} (expires ${formatDate(a.security_license_expiry)})`
                    : 'Not licensed',
                ],
              ]}
            />
          </Card>

          {/* Documents ---------------------------------------------------- */}
          <Card padded={false}>
            <CardHeader
              title="Uploaded documents"
              description={`${documents.data?.length ?? 0} uploaded`}
            />
            {documents.isLoading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-11" />
                ))}
              </div>
            ) : documents.isError ? (
              <ErrorState
                message={errorMessage(documents.error)}
                onRetry={() => void documents.refetch()}
                className="py-8"
              />
            ) : (documents.data?.length ?? 0) === 0 ? (
              <p className="p-5 text-sm text-[var(--app-text-muted)]">
                No documents were uploaded with this application.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--app-border)]">
                {documents.data!.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex flex-wrap items-center gap-3 px-5 py-3"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--app-bg)] text-[var(--app-text-subtle)]">
                      {isImage(doc) ? (
                        <FileImage className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <FileText className="h-4 w-4" aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--app-text)]">
                        {documentTypeMeta(doc.document_type)?.label ??
                          humanize(doc.document_type)}
                      </p>
                      <p className="truncate text-xs text-[var(--app-text-subtle)]">
                        {doc.file_name} · {formatFileSize(doc.size_bytes)}
                      </p>
                    </div>

                    {doc.verified_at ? (
                      <Badge tone="success" size="sm">
                        Verified
                      </Badge>
                    ) : (
                      <Can roles={[...ADMIN_ROLES, 'hr_staff', 'recruitment_officer']}>
                        <Button
                          size="sm"
                          variant="ghost"
                          leftIcon={<BadgeCheck className="h-3.5 w-3.5" />}
                          onClick={() => verify.mutate(doc.id)}
                          isLoading={verify.isPending && verify.variables === doc.id}
                        >
                          Verify
                        </Button>
                      </Can>
                    )}

                    <Button
                      size="sm"
                      variant="secondary"
                      leftIcon={<Eye className="h-3.5 w-3.5" />}
                      onClick={() => void openDocument(doc.id)}
                    >
                      {isImage(doc) ? 'Preview' : 'Open'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-[var(--app-border)] px-5 py-2.5 text-xs text-[var(--app-text-subtle)]">
              Images preview here; other files open in a new tab. Links are signed and expire after 60 seconds.
            </p>
          </Card>
        </div>

        {/* Sidebar -------------------------------------------------------- */}
        <div className="space-y-6">
          <Card padded={false}>
            <CardHeader title="Contact" />
            <div className="space-y-2 p-5">
              <a
                href={`mailto:${a.email}`}
                className="flex items-center gap-2.5 text-sm text-brand-600 hover:underline"
              >
                <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{a.email}</span>
              </a>
              <a
                href={`tel:${a.phone}`}
                className="flex items-center gap-2.5 text-sm text-brand-600 hover:underline"
              >
                <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                {a.phone}
              </a>
            </div>
          </Card>

          {a.interview_at && (
            <Card className="border-info/30 bg-info-soft">
              <div className="flex items-start gap-3">
                <CalendarClock
                  className="mt-0.5 h-5 w-5 shrink-0 text-info"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-semibold text-info">Interview</p>
                  <p className="mt-0.5 text-sm text-[var(--app-text-muted)]">
                    {formatDateTime(a.interview_at)}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {a.rejection_reason && (
            <Card className="border-danger/30 bg-danger-soft">
              <p className="text-sm font-semibold text-danger">Rejection reason</p>
              <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                {a.rejection_reason}
              </p>
            </Card>
          )}

          {a.interview_notes && (
            <Card padded={false}>
              <CardHeader title="Interview notes" />
              <p className="p-5 text-sm whitespace-pre-wrap text-[var(--app-text-muted)]">
                {a.interview_notes}
              </p>
            </Card>
          )}

          <Card padded={false}>
            <CardHeader title="Status history" />
            {history.isLoading ? (
              <p className="p-5 text-sm text-[var(--app-text-muted)]">Loading…</p>
            ) : (
              <ol className="p-5">
                {(history.data ?? []).map((entry, index, all) => {
                  const meta = applicantStatusMeta(entry.to_status)
                  const isLast = index === all.length - 1
                  return (
                    <li key={entry.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span
                          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500"
                          aria-hidden="true"
                        />
                        {!isLast && (
                          <span
                            className="w-px flex-1 bg-[var(--app-border)]"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                      <div className={isLast ? '' : 'pb-4'}>
                        <p className="text-sm font-medium text-[var(--app-text)]">
                          {meta?.label ?? entry.to_status}
                        </p>
                        <p className="text-xs text-[var(--app-text-subtle)]">
                          {formatDateTime(entry.created_at)}
                        </p>
                        {entry.note && (
                          <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                            {entry.note}
                          </p>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </Card>
        </div>
      </div>

      {/* Document preview ------------------------------------------------- */}
      <ImageViewer
        open={preview !== null}
        onClose={() => setPreview(null)}
        src={preview?.url ?? null}
        alt={preview ? `${documentTypeMeta(preview.doc.document_type)?.label ?? 'Document'} for ${fullName(a)}` : ''}
        title={preview ? (documentTypeMeta(preview.doc.document_type)?.label ?? humanize(preview.doc.document_type)) : undefined}
        subtitle={preview ? `${preview.doc.file_name} · ${fullName(a)}` : undefined}
        onRetry={preview ? () => void loadPreview(preview.doc) : undefined}
      />

      {/* Status change dialog --------------------------------------------- */}
      <Modal
        open={statusTarget !== null}
        onClose={closeStatusDialog}
        title={statusTarget ? MOVE_ACTIONS[statusTarget].label : ''}
        description={`${fullName(a)} · ${a.reference_no}`}
        size="sm"
        // A typed rejection reason or note should not vanish on a stray Esc.
        confirmClose={rejectionReason.trim() !== '' || note.trim() !== ''}
        footer={
          <>
            <Button variant="secondary" onClick={closeStatusDialog}>
              Cancel
            </Button>
            <Button
              variant={statusTarget === 'rejected' ? 'danger' : 'primary'}
              onClick={() => changeStatus.mutate()}
              isLoading={changeStatus.isPending}
              disabled={statusTarget === 'rejected' && rejectionReason.trim().length === 0}
            >
              {statusTarget === 'rejected'
                ? 'Reject application'
                : statusTarget === 'archived'
                  ? 'Archive applicant'
                  : 'Confirm'}
            </Button>
          </>
        }
      >
        <DraftNotice restoredAt={statusDraft.restoredAt} onDiscard={statusDraft.discard} />
        <div className="space-y-4">
          {(statusTarget === 'rejected' || statusTarget === 'archived') && (
            <p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-amber-900 dark:bg-warning/10 dark:text-amber-200">
              {statusTarget === 'rejected'
                ? 'The applicant leaves the active pipeline. This can be undone only by returning them to Pending.'
                : 'Archived applicants are closed and retained per policy. This cannot be moved back.'}
            </p>
          )}

          {statusTarget === 'rejected' && (
            <Field
              label="Reason for rejection"
              required
              hint="Recorded against the application and required by the database."
            >
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Did not meet the licensing requirement"
              />
            </Field>
          )}

          {statusTarget === 'interview' && (
            <Field label="Interview date and time" hint="Optional — can be set later.">
              <Input
                type="datetime-local"
                value={interviewAt}
                onChange={(e) => setInterviewAt(e.target.value)}
              />
            </Field>
          )}

          {statusTarget !== 'rejected' && (
            <Field label="Note" hint="Optional. Visible to staff only.">
              <Textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          )}

          {/* Only the three statuses with a template are worth offering. Moving
              to pending, hired or archived sends nothing regardless. */}
          {statusTarget !== null && NOTIFIABLE.includes(statusTarget) && (
            <div className="border-t border-[var(--app-border)] pt-4">
              <Checkbox
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
                label={`Email the applicant at ${a.email}`}
                description={
                  statusTarget === 'interview' && !interviewAt
                    ? 'No date set — the email will say the team will be in touch to schedule.'
                    : statusTarget === 'rejected'
                      ? 'Sends a courteous notice. The reason above is kept internal and is not included.'
                      : statusTarget === 'hired'
                        ? 'Confirms the outcome and what to bring. Start date and terms are not included.'
                        : 'Sent once per stage; re-saving will not send a duplicate.'
                }
              />
            </div>
          )}
        </div>
      </Modal>

      {/* Hire dialog ------------------------------------------------------ */}
      <Modal
        open={hireOpen}
        onClose={closeHireDialog}
        title="Onboard to personnel roster"
        description={`${fullName(a)} · ${a.reference_no}`}
        size="sm"
        dismissOnOverlayClick={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setHireOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => hire.mutate()} isLoading={hire.isPending}>
              Confirm hire
            </Button>
          </>
        }
      >
        <DraftNotice restoredAt={hireDraft.restoredAt} onDiscard={hireDraft.discard} />
        <div className="space-y-4">
          <p className="text-sm text-[var(--app-text-muted)]">
            This marks the application as hired and creates a personnel record
            with a new employee number. It runs as a single transaction — the
            applicant's details, statutory numbers and licence carry across
            automatically.
          </p>

          <Field
            label="Rank"
            hint={
              availableRanks.isLoading
                ? 'Loading ranks…'
                : `Configured for ${positionLookup.name(a.position_id)}. Manage these under Configuration → Ranks.`
            }
          >
            <Select
              placeholder="No rank"
              value={rankId}
              onChange={(e) => setRankId(e.target.value)}
              options={(availableRanks.data ?? []).map((r) => ({
                value: r.id,
                label: r.name,
              }))}
            />
          </Field>

          <div className="border-t border-[var(--app-border)] pt-4">
            <Checkbox
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              label={`Email the applicant at ${a.email}`}
              description="Sends a welcome note confirming the outcome and what to bring. Start date and terms are not included."
            />
          </div>
        </div>
      </Modal>
    </>
  )
}

/* -------------------------------------------------------------------------- */

function DetailGrid({ items }: { items: [string, string | number | null][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-0 p-5 sm:grid-cols-2">
      {items.map(([term, value]) => (
        <div
          key={term}
          className="flex flex-col gap-0.5 border-b border-[var(--app-border)] py-2.5 last:border-0 sm:border-0"
        >
          <dt className="text-xs font-medium tracking-wide text-[var(--app-text-subtle)] uppercase">
            {term}
          </dt>
          <dd className="text-sm break-words text-[var(--app-text)]">
            {value ?? '—'}
          </dd>
        </div>
      ))}
    </dl>
  )
}
