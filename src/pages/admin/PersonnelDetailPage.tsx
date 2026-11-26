import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertOctagon,
  ArrowLeft,
  Ban,
  ChevronDown,
  FileDown,
  Mail,
  MapPinned,
  PauseCircle,
  Pencil,
  Phone,
  PlayCircle,
  ShieldAlert,
  UserCheck,
  UserMinus,
  UserX,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ErrorState, LoadingState } from '@/components/ui/Feedback'
import { useToast } from '@/components/ui/Toast'
import { queryKeys } from '@/lib/queryKeys'
import { errorMessage } from '@/lib/errors'
import {
  getPersonnel,
  getPersonnelDeployments,
  listPersonnelActions,
} from '@/features/personnel/api/personnelApi'
import { getApplicant } from '@/features/applicants/api/applicantsApi'
import { ApplicantDocumentsCard } from '@/features/applicants/components/ApplicantDocumentsCard'
import { usePositionLookup } from '@/features/config/hooks/useConfig'
import { useAuth } from '@/contexts/AuthContext'
import { PdsDetails } from '@/features/pds/PdsDetails'
import {
  PersonnelActionDialog,
  type PersonnelActionKind,
} from '@/features/personnel/components/PersonnelActionDialog'
import { PersonnelActionLog } from '@/features/personnel/components/PersonnelActionLog'
import { EditPersonnelDialog } from '@/features/personnel/components/EditPersonnelDialog'
import { downloadPersonalDataSheet } from '@/features/personnel/export/personalDataSheet'
import { listBranches } from '@/features/branches/api/branchesApi'
import {
  deploymentStatusMeta,
  employmentStatusMeta,
  shiftMeta,
  ADMIN_ROLES,
} from '@/utils/constants'
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  fullName,
  humanize,
  maskId,
} from '@/utils/format'
import { formatFeetInches, formatPounds } from '@/utils/units'

/** Administrators and HR — mirrors assert_can_discipline_personnel() (0027). */
const DISCIPLINE_ROLES = [...ADMIN_ROLES, 'hr_staff'] as const

export default function PersonnelDetailPage() {
  const { id = '' } = useParams()
  const [action, setAction] = useState<PersonnelActionKind | null>(null)
  const [exporting, setExporting] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const { hasRole } = useAuth()
  const positionLookup = usePositionLookup()
  const toast = useToast()

  const person = useQuery({
    queryKey: queryKeys.personnel.detail(id),
    queryFn: () => getPersonnel(id),
    enabled: Boolean(id),
  })

  // Same cache entry as the history card below, so this costs no extra request.
  const actions = useQuery({
    queryKey: queryKeys.personnel.actions(id),
    queryFn: () => listPersonnelActions(id),
    enabled: Boolean(id),
  })
  const rehires = (actions.data ?? []).filter((a) => a.action_type === 'rehire')

  // The application this guard was hired from. It is the same person's record,
  // so its details (clearances, application, documents) are shown here too
  // rather than on a separate page. A role without access to applicants simply
  // does not get those sections.
  const applicantId = person.data?.applicant_id ?? ''
  const application = useQuery({
    queryKey: queryKeys.applicants.detail(applicantId),
    queryFn: () => getApplicant(applicantId),
    enabled: Boolean(applicantId),
    retry: false,
  })

  const deployments = useQuery({
    queryKey: queryKeys.personnel.deployments(id),
    queryFn: () => getPersonnelDeployments(id),
    enabled: Boolean(id),
  })

  const branches = useQuery({
    queryKey: queryKeys.branches.list({ active: true }),
    queryFn: () => listBranches(true),
    staleTime: 5 * 60_000,
  })


  // Shown in the separation / blocklist dialogs so the operator sees what
  // closing this employment will also close.
  const openDeployments = (deployments.data ?? [])
    .filter((d) => d.status === 'pending' || d.status === 'active')
    .map((d) => ({
      ...d,
      branch_name: branches.data?.find((b) => b.id === d.branch_id)?.name ?? null,
    }))

  if (person.isLoading) return <LoadingState label="Loading personnel record…" />

  if (person.isError || !person.data) {
    return (
      <Card>
        <ErrorState
          title="Personnel record not found"
          message={
            person.error
              ? errorMessage(person.error)
              : 'This record does not exist, or you do not have access to it.'
          }
        />
        <div className="flex justify-center pb-6">
          <Link to="/admin/personnel">
            <Button variant="secondary" leftIcon={<ArrowLeft className="h-4 w-4" />}>
              Back to roster
            </Button>
          </Link>
        </div>
      </Card>
    )
  }

  const p = person.data
  const app = p.applicant_id ? (application.data ?? null) : null
  const statusMeta = employmentStatusMeta(p.employment_status)
  const employed = ['active', 'on_leave', 'suspended'].includes(p.employment_status)
  const canRehire = p.employment_status === 'resigned' && !p.is_blocklisted

  async function exportPds() {
    setExporting(true)
    try {
      await downloadPersonalDataSheet({ person: p })
      toast.success('Personal Data Sheet downloaded')
    } catch (error) {
      toast.error('Could not export', errorMessage(error))
    } finally {
      setExporting(false)
    }
  }

  // The facility is the live deployment: the active one, else the upcoming one.
  const currentFacility =
    openDeployments.find((d) => d.status === 'active') ?? openDeployments[0] ?? null
  const branchName = (branchId: string) =>
    branches.data?.find((b) => b.id === branchId)?.name ?? branchId

  const statusBadges = (
    <>
      <Badge tone={statusMeta?.tone ?? 'neutral'} dot>
        {statusMeta?.label}
      </Badge>
      {p.is_blocklisted && (
        <Badge tone="danger" dot>
          Blocklisted
        </Badge>
      )}
      {rehires.length > 0 && (
        <span title={`Last re-hired ${formatDate(rehires[0]!.effective_date)}`}>
          <Badge tone="info" dot>
            Re-hired{rehires.length > 1 ? ` ×${rehires.length}` : ''}
          </Badge>
        </span>
      )}
    </>
  )

  // Rendered twice: in the sidebar on wide screens, and as a collapsible panel
  // near the top on phones, where the sidebar would sit below everything else.
  const disciplineButtons = (
    <>
      <Button
        variant="secondary"
        leftIcon={<AlertOctagon className="h-4 w-4" />}
        onClick={() => setAction('violation')}
      >
        Record violation / offense
      </Button>
      {(p.employment_status === 'active' || p.employment_status === 'on_leave') && (
        <Button
          variant="secondary"
          leftIcon={<PauseCircle className="h-4 w-4" />}
          onClick={() => setAction('suspend')}
        >
          Suspend
        </Button>
      )}
      {p.employment_status === 'suspended' && (
        <Button
          variant="secondary"
          leftIcon={<PlayCircle className="h-4 w-4" />}
          onClick={() => setAction('lift')}
        >
          Lift suspension
        </Button>
      )}
      {employed && (
        <>
          <Button
            variant="secondary"
            leftIcon={<UserMinus className="h-4 w-4" />}
            onClick={() => setAction('resign')}
          >
            Record resignation
          </Button>
          <Button
            variant="secondary"
            leftIcon={<UserX className="h-4 w-4" />}
            onClick={() => setAction('terminate')}
          >
            Terminate
          </Button>
        </>
      )}
      {canRehire && (
        <Button
          variant="secondary"
          leftIcon={<UserCheck className="h-4 w-4" />}
          onClick={() => setAction('rehire')}
        >
          Re-hire
        </Button>
      )}
      <Button
        variant="danger"
        leftIcon={<Ban className="h-4 w-4" />}
        onClick={() => setAction('blocklist')}
      >
        Blocklist (remove from company)
      </Button>
    </>
  )
  const canDiscipline = !p.is_blocklisted && hasRole(...DISCIPLINE_ROLES)

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Personnel', to: '/admin/personnel' },
          { label: p.employee_no },
        ]}
        title={fullName(p)}
        className="mb-4 sm:mb-6"
        description={
          <div className="space-y-2">
            <span className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
              <span className="font-mono">{p.employee_no}</span>
              {currentFacility && (
                <>
                  <span aria-hidden="true" className="hidden sm:inline">
                    ·
                  </span>
                  <span>{currentFacility.branch_name ?? 'Facility'}</span>
                </>
              )}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">{statusBadges}</div>
          </div>
        }
        actionsClassName="w-full sm:w-auto"
        actions={
          hasRole(...DISCIPLINE_ROLES) && (
            // Two equal columns on phones; a row of buttons from `sm` up.
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
              <Button
                variant="secondary"
                leftIcon={<Pencil className="h-4 w-4" />}
                onClick={() => setEditOpen(true)}
              >
                <span className="sm:hidden">Edit</span>
                <span className="hidden sm:inline">Edit information</span>
              </Button>
              {/* Full government ID numbers: administrators and HR only. */}
              <Button
                variant="secondary"
                leftIcon={<FileDown className="h-4 w-4" />}
                onClick={() => void exportPds()}
                isLoading={exporting}
              >
                Export PDS
              </Button>
              {canRehire && (
                <Button
                  className="col-span-2"
                  leftIcon={<UserCheck className="h-4 w-4" />}
                  onClick={() => setAction('rehire')}
                >
                  Re-hire
                </Button>
              )}
            </div>
          )
        }
      />

      {/* Phones: call or email in one tap, without scrolling to the sidebar. */}
      {(p.phone || p.email) && (
        <div className="mb-4 grid grid-cols-2 gap-2 lg:hidden">
          {p.phone ? (
            <a href={`tel:${p.phone}`} className={QUICK_LINK}>
              <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">Call</span>
            </a>
          ) : (
            <span />
          )}
          {p.email ? (
            <a href={`mailto:${p.email}`} className={QUICK_LINK}>
              <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">Email</span>
            </a>
          ) : (
            <span />
          )}
        </div>
      )}

      {p.is_blocklisted && (
        <div
          role="note"
          className="mb-6 flex gap-3 rounded-lg border border-danger/40 bg-danger/5 px-4 py-3"
        >
          <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold break-words text-[var(--app-text)]">
              Blocklisted — removed from the company effective {formatDate(p.blocklisted_on)}
            </p>
            <p className="mt-0.5 text-sm break-words whitespace-pre-line text-[var(--app-text-muted)]">
              {p.blocklist_reason}
            </p>
            <p className="mt-1 text-xs text-[var(--app-text-subtle)]">
              This person cannot be re-hired or apply again with the same email address.
            </p>
          </div>
        </div>
      )}

      {canDiscipline && (
        <details className="group mb-4 rounded-[var(--radius-card)] border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[var(--shadow-card)] lg:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-[var(--app-text)] [&::-webkit-details-marker]:hidden">
            <ShieldAlert className="h-4 w-4 text-brand-500" aria-hidden="true" />
            Status &amp; disciplinary actions
            <ChevronDown
              className="ml-auto h-4 w-4 text-[var(--app-text-subtle)] transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="grid gap-2 border-t border-[var(--app-border)] p-4 sm:grid-cols-2">
            {disciplineButtons}
          </div>
        </details>
      )}

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 sm:space-y-6 lg:col-span-2">
          <Card padded={false}>
            <CardHeader title="Employment" />
            <InfoList
              items={[
                ['Employee number', p.employee_no],
                ['Status', statusMeta?.label ?? '—'],
                [
                  'Facility',
                  currentFacility
                    ? `${currentFacility.branch_name ?? 'Facility'} · ${humanize(currentFacility.shift)} shift${
                        currentFacility.status === 'pending'
                          ? ` (starts ${formatDate(currentFacility.start_date)})`
                          : ''
                      }`
                    : 'Not assigned',
                ],
                ['Date hired', formatDate(p.date_hired)],
                ['Status effective', formatDate(p.status_effective_date)],
                ...(rehires.length > 0
                  ? ([
                      [
                        'Re-hired',
                        `${formatDate(rehires[0]!.effective_date)}${
                          rehires.length > 1 ? ` (${rehires.length} times)` : ''
                        }`,
                      ],
                    ] as [string, string][])
                  : []),
                ['Date separated', formatDate(p.date_separated)],
              ]}
            />
          </Card>

          <Card padded={false}>
            <CardHeader title="Personal and statutory details" />
            <InfoList
              items={[
                ['Date of birth', formatDate(p.birth_date)],
                ['Sex', humanize(p.sex)],
                ['Civil status', humanize(p.civil_status)],
                ['Height', p.height_cm ? `${p.height_cm} cm (${formatFeetInches(p.height_cm)})` : '—'],
                ['Weight', p.weight_kg ? `${p.weight_kg} kg (${formatPounds(p.weight_kg)})` : '—'],
                ['Highest education', p.highest_education ?? '—'],
                ['Latest tel / CP no.', p.phone ?? '—'],
                ['Email', p.email ?? '—'],
                ['Address', p.address ?? '—'],
                ['SSS', maskId(p.sss_no)],
                ['PhilHealth', maskId(p.philhealth_no)],
                ['Pag-IBIG', maskId(p.pagibig_no)],
                ['TIN', maskId(p.tin_no)],
                ['Security licence', p.security_license_no ?? '—'],
                ['Licence expiry', formatDate(p.security_license_expiry)],
                ...(app
                  ? ([
                      ['NBI clearance', app.nbi_clearance_no ?? '—'],
                      ['NBI expiry', formatDate(app.nbi_clearance_expiry)],
                      ['Police clearance', app.police_clearance_no ?? '—'],
                    ] as [string, string][])
                  : []),
                ['Emergency contact', p.emergency_contact_name ?? '—'],
                ['Emergency phone', p.emergency_contact_phone ?? '—'],
              ]}
            />
          </Card>

          {app && (
            <Card padded={false}>
              <CardHeader title="Application" />
              <InfoList
                items={[
                  ['Reference no.', <span className="font-mono">{app.reference_no}</span>],
                  ['Position applied', positionLookup.name(app.position_id)],
                  ['Date applied', formatDate(app.created_at)],
                  ['Experience', `${app.years_experience} year(s)`],
                  ['Expected salary', formatCurrency(app.expected_salary)],
                  ['Available from', formatDate(app.availability_date)],
                  ['Heard about us via', app.source ?? '—'],
                  ['Interview', app.interview_at ? formatDateTime(app.interview_at) : '—'],
                ]}
              />
              {app.interview_notes && (
                <div className="border-t border-[var(--app-border)] px-4 py-3 sm:px-5">
                  <p className="text-xs font-medium tracking-wide text-[var(--app-text-subtle)] uppercase">
                    Interview notes
                  </p>
                  <p className="mt-1 text-sm whitespace-pre-wrap text-[var(--app-text-muted)]">
                    {app.interview_notes}
                  </p>
                </div>
              )}
            </Card>
          )}

          <PdsDetails
            record={p}
          />

          {app && <ApplicantDocumentsCard applicantId={app.id} personName={fullName(p)} />}

          <PersonnelActionLog personnelId={p.id} />

          <Card padded={false}>
            <CardHeader
              title="Deployment history"
              description={`${deployments.data?.length ?? 0} assignment(s)`}
              icon={<MapPinned className="h-4 w-4" aria-hidden="true" />}
            />
            {deployments.isLoading ? (
              <p className="p-4 text-sm text-[var(--app-text-muted)] sm:p-5">Loading…</p>
            ) : (deployments.data?.length ?? 0) === 0 ? (
              <p className="p-4 text-sm text-[var(--app-text-muted)] sm:p-5">
                This person has never been deployed.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--app-border)]">
                {deployments.data!.map((d) => {
                  const meta = deploymentStatusMeta(d.status)
                  return (
                    <li key={d.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium break-words text-[var(--app-text)]">
                          {branchName(d.branch_id)}
                        </p>
                        <p className="text-xs text-[var(--app-text-subtle)]">
                          {shiftMeta(d.shift)?.label} · {formatDate(d.start_date)} –{' '}
                          {d.end_date ? formatDate(d.end_date) : 'present'}
                          {d.daily_rate ? ` · ${formatCurrency(d.daily_rate)}/day` : ''}
                        </p>
                        {d.ended_reason && (
                          <p className="mt-0.5 text-xs break-words text-[var(--app-text-muted)]">
                            {d.ended_reason}
                          </p>
                        )}
                      </div>
                      <Badge tone={meta?.tone ?? 'neutral'} size="sm" className="shrink-0">
                        {meta?.label}
                      </Badge>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-4 sm:space-y-6">
          {canDiscipline && (
            <Card padded={false} className="hidden lg:block">
              <CardHeader
                title="Disciplinary and status actions"
                icon={<ShieldAlert className="h-4 w-4" aria-hidden="true" />}
              />
              <div className="flex flex-col gap-2 p-5">{disciplineButtons}</div>
            </Card>
          )}

          <Card padded={false} className="hidden lg:block">
            <CardHeader title="Contact" />
            <div className="space-y-2 p-5">
              {p.email ? (
                <a
                  href={`mailto:${p.email}`}
                  className="flex items-center gap-2.5 text-sm text-brand-600 hover:underline"
                >
                  <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{p.email}</span>
                </a>
              ) : (
                <p className="text-sm text-[var(--app-text-subtle)]">
                  No email on record
                </p>
              )}
              {p.phone && (
                <a
                  href={`tel:${p.phone}`}
                  className="flex items-center gap-2.5 text-sm text-brand-600 hover:underline"
                >
                  <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {p.phone}
                </a>
              )}
            </div>
          </Card>

        </div>
      </div>

      <EditPersonnelDialog
        open={editOpen}
        person={p}
        application={app}
        onClose={() => setEditOpen(false)}
        onResume={() => setEditOpen(true)}
      />


      <PersonnelActionDialog
        key={action ?? 'closed'}
        kind={action}
        person={p}
        openDeployments={openDeployments}
        onClose={() => setAction(null)}
      />
    </>
  )
}

/* -------------------------------------------------------------------------- */

const QUICK_LINK =
  'inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 text-sm font-medium text-brand-600 shadow-[var(--shadow-card)] active:bg-[var(--app-bg)]'

/**
 * Label / value pairs. Phones: one compact row each, label left and value
 * right, so a long card is a quick scan rather than a tall stack. From `sm`
 * up: two columns, label above value.
 */
function InfoList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-[var(--app-border)] px-4 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:divide-y-0 sm:p-5">
      {items.map(([term, value]) => (
        <div
          key={term}
          className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-baseline gap-3 py-2.5 sm:block"
        >
          <dt className="text-xs font-medium tracking-wide text-[var(--app-text-subtle)] uppercase">
            {term}
          </dt>
          <dd className="text-right text-sm break-words text-[var(--app-text)] sm:mt-0.5 sm:text-left">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
