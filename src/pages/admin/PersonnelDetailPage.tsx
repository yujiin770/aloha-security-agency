import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertOctagon,
  ArrowLeft,
  Ban,
  FileDown,
  Mail,
  MapPinned,
  PauseCircle,
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
import { Can } from '@/app/guards'
import { queryKeys } from '@/lib/queryKeys'
import { errorMessage } from '@/lib/errors'
import {
  getPersonnel,
  getPersonnelDeployments,
  listPersonnelActions,
} from '@/features/personnel/api/personnelApi'
import {
  PersonnelActionDialog,
  type PersonnelActionKind,
} from '@/features/personnel/components/PersonnelActionDialog'
import { PersonnelActionLog } from '@/features/personnel/components/PersonnelActionLog'
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
  fullName,
  humanize,
  maskId,
} from '@/utils/format'

/** Administrators and HR — mirrors assert_can_discipline_personnel() (0027). */
const DISCIPLINE_ROLES = [...ADMIN_ROLES, 'hr_staff'] as const

export default function PersonnelDetailPage() {
  const { id = '' } = useParams()
  const [action, setAction] = useState<PersonnelActionKind | null>(null)
  const [exporting, setExporting] = useState(false)
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

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Personnel', to: '/admin/personnel' },
          { label: p.employee_no },
        ]}
        title={fullName(p)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{p.employee_no}</span>
            {currentFacility && (
              <>
                <span aria-hidden="true">·</span>
                <span>{currentFacility.branch_name ?? 'Facility'}</span>
              </>
            )}
          </span>
        }
        actions={
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
            {/* Full government ID numbers: administrators and HR only. */}
            <Can roles={[...DISCIPLINE_ROLES]}>
              <Button
                variant="secondary"
                leftIcon={<FileDown className="h-4 w-4" />}
                onClick={() => void exportPds()}
                isLoading={exporting}
              >
                Export PDS
              </Button>
            </Can>
            {canRehire && (
              <Can roles={[...DISCIPLINE_ROLES]}>
                <Button
                  leftIcon={<UserCheck className="h-4 w-4" />}
                  onClick={() => setAction('rehire')}
                >
                  Re-hire
                </Button>
              </Can>
            )}
          </>
        }
      />

      {p.is_blocklisted && (
        <div
          role="note"
          className="mb-6 flex gap-3 rounded-lg border border-danger/40 bg-danger/5 px-4 py-3"
        >
          <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--app-text)]">
              Blocklisted — removed from the company effective {formatDate(p.blocklisted_on)}
            </p>
            <p className="mt-0.5 text-sm whitespace-pre-line text-[var(--app-text-muted)]">
              {p.blocklist_reason}
            </p>
            <p className="mt-1 text-xs text-[var(--app-text-subtle)]">
              This person cannot be re-hired or apply again with the same email address.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card padded={false}>
            <CardHeader title="Employment" />
            <dl className="grid gap-x-6 p-5 sm:grid-cols-2">
              {(
                [
                  ['Employee number', p.employee_no],
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
                  ['Status', statusMeta?.label ?? '—'],
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
                ] as [string, string][]
              ).map(([term, value]) => (
                <div key={term} className="py-2.5">
                  <dt className="text-xs font-medium tracking-wide text-[var(--app-text-subtle)] uppercase">
                    {term}
                  </dt>
                  <dd className="mt-0.5 text-sm text-[var(--app-text)]">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card padded={false}>
            <CardHeader title="Personal and statutory details" />
            <dl className="grid gap-x-6 p-5 sm:grid-cols-2">
              {(
                [
                  ['Date of birth', formatDate(p.birth_date)],
                  ['Sex', humanize(p.sex)],
                  ['Address', p.address ?? '—'],
                  ['SSS', maskId(p.sss_no)],
                  ['PhilHealth', maskId(p.philhealth_no)],
                  ['Pag-IBIG', maskId(p.pagibig_no)],
                  ['TIN', maskId(p.tin_no)],
                  ['Security licence', p.security_license_no ?? '—'],
                  ['Licence expiry', formatDate(p.security_license_expiry)],
                  ['Emergency contact', p.emergency_contact_name ?? '—'],
                  ['Emergency phone', p.emergency_contact_phone ?? '—'],
                ] as [string, string][]
              ).map(([term, value]) => (
                <div key={term} className="py-2.5">
                  <dt className="text-xs font-medium tracking-wide text-[var(--app-text-subtle)] uppercase">
                    {term}
                  </dt>
                  <dd className="mt-0.5 text-sm text-[var(--app-text)]">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <PersonnelActionLog personnelId={p.id} />

          <Card padded={false}>
            <CardHeader
              title="Deployment history"
              description={`${deployments.data?.length ?? 0} assignment(s)`}
              icon={<MapPinned className="h-4 w-4" aria-hidden="true" />}
            />
            {deployments.isLoading ? (
              <p className="p-5 text-sm text-[var(--app-text-muted)]">Loading…</p>
            ) : (deployments.data?.length ?? 0) === 0 ? (
              <p className="p-5 text-sm text-[var(--app-text-muted)]">
                This person has never been deployed.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--app-border)]">
                {deployments.data!.map((d) => {
                  const meta = deploymentStatusMeta(d.status)
                  return (
                    <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--app-text)]">
                          {branchName(d.branch_id)}
                        </p>
                        <p className="text-xs text-[var(--app-text-subtle)]">
                          {shiftMeta(d.shift)?.label} · {formatDate(d.start_date)} –{' '}
                          {d.end_date ? formatDate(d.end_date) : 'present'}
                          {d.daily_rate ? ` · ${formatCurrency(d.daily_rate)}/day` : ''}
                        </p>
                        {d.ended_reason && (
                          <p className="mt-0.5 text-xs text-[var(--app-text-muted)]">
                            {d.ended_reason}
                          </p>
                        )}
                      </div>
                      <Badge tone={meta?.tone ?? 'neutral'} size="sm">
                        {meta?.label}
                      </Badge>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {!p.is_blocklisted && (
            <Can roles={[...DISCIPLINE_ROLES]}>
              <Card padded={false}>
                <CardHeader
                  title="Disciplinary and status actions"
                  icon={<ShieldAlert className="h-4 w-4" aria-hidden="true" />}
                />
                <div className="flex flex-col gap-2 p-5">
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
                </div>
              </Card>
            </Can>
          )}

          <Card padded={false}>
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

          {p.applicant_id && (
            <Card>
              <p className="text-sm text-[var(--app-text-muted)]">
                Onboarded from a recruitment application.
              </p>
              <Link
                to={`/admin/applicants/${p.applicant_id}`}
                className="mt-2 inline-block text-sm font-medium text-brand-600 hover:underline"
              >
                View original application
              </Link>
            </Card>
          )}
        </div>
      </div>

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
