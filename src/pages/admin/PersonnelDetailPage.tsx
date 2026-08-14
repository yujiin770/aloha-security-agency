import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Mail, MapPinned, Phone, UserMinus } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { ErrorState, LoadingState } from '@/components/ui/Feedback'
import { useToast } from '@/components/ui/Toast'
import { Can } from '@/app/guards'
import { queryKeys } from '@/lib/queryKeys'
import { errorMessage } from '@/lib/errors'
import {
  getPersonnel,
  getPersonnelDeployments,
  separatePersonnel,
} from '@/features/personnel/api/personnelApi'
import { listBranches } from '@/features/branches/api/branchesApi'
import {
  deploymentStatusMeta,
  employmentStatusMeta,
  shiftMeta,
  ADMIN_ROLES,
} from '@/utils/constants'
import { usePositionLookup, useRankLookup } from '@/features/config/hooks/useConfig'
import {
  formatCurrency,
  formatDate,
  fullName,
  humanize,
  maskId,
} from '@/utils/format'
import type { EmploymentStatus } from '@/types/database.types'

export default function PersonnelDetailPage() {
  const { id = '' } = useParams()
  const toast = useToast()
  const qc = useQueryClient()

  const [separateOpen, setSeparateOpen] = useState(false)
  const [separationStatus, setSeparationStatus] =
    useState<Extract<EmploymentStatus, 'resigned' | 'terminated'>>('resigned')
  const [separationDate, setSeparationDate] = useState(
    new Date().toISOString().slice(0, 10),
  )

  const person = useQuery({
    queryKey: queryKeys.personnel.detail(id),
    queryFn: () => getPersonnel(id),
    enabled: Boolean(id),
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

  const positionLookup = usePositionLookup()
  const rankLookup = useRankLookup()

  // Shown in the separation dialog so the operator sees what closing this
  // employment will also close.
  const openDeployments = (deployments.data ?? [])
    .filter((d) => d.status === 'pending' || d.status === 'active')
    .map((d) => ({
      ...d,
      branch_name: branches.data?.find((b) => b.id === d.branch_id)?.name ?? null,
    }))

  const separate = useMutation({
    mutationFn: () =>
      separatePersonnel({
        id,
        status: separationStatus,
        dateSeparated: separationDate,
      }),
    onSuccess: (_data, _vars) => {
      toast.success(
        'Separation recorded',
        openDeployments.length > 0
          ? `${openDeployments.length} open deployment(s) were ended.`
          : undefined,
      )
      setSeparateOpen(false)
      // Separation now writes to `deployments` as well, and the facility
      // headcount views read from it — so the branch and dashboard caches are
      // stale too, not just the roster.
      void qc.invalidateQueries({ queryKey: queryKeys.personnel.all })
      void qc.invalidateQueries({ queryKey: queryKeys.deployments.all })
      void qc.invalidateQueries({ queryKey: queryKeys.branches.all })
      void qc.invalidateQueries({ queryKey: queryKeys.reports.all })
    },
    onError: (error) => toast.error('Could not update record', errorMessage(error)),
  })

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
            <span aria-hidden="true">·</span>
            <span>{positionLookup.name(p.position_id)}</span>
            {p.rank_id && (
              <>
                <span aria-hidden="true">·</span>
                <span>{rankLookup.name(p.rank_id)}</span>
              </>
            )}
          </span>
        }
        actions={
          <>
            <Badge tone={statusMeta?.tone ?? 'neutral'} dot>
              {statusMeta?.label}
            </Badge>
            {p.employment_status === 'active' && (
              <Can roles={[...ADMIN_ROLES, 'hr_staff']}>
                <Button
                  variant="secondary"
                  leftIcon={<UserMinus className="h-4 w-4" />}
                  onClick={() => setSeparateOpen(true)}
                >
                  Record separation
                </Button>
              </Can>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card padded={false}>
            <CardHeader title="Employment" />
            <dl className="grid gap-x-6 p-5 sm:grid-cols-2">
              {(
                [
                  ['Employee number', p.employee_no],
                  ['Position', positionLookup.name(p.position_id)],
                  ['Rank', rankLookup.name(p.rank_id)],
                  ['Date hired', formatDate(p.date_hired)],
                  ['Status', statusMeta?.label ?? '—'],
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

      <Modal
        open={separateOpen}
        onClose={() => setSeparateOpen(false)}
        title="Record separation"
        description={`${fullName(p)} · ${p.employee_no}`}
        size="sm"
        dismissOnOverlayClick={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSeparateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => separate.mutate()}
              isLoading={separate.isPending}
            >
              Record separation
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--app-text-muted)]">
            This marks the person as no longer employed.
          </p>

          {openDeployments.length > 0 && (
            <div className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5 dark:bg-warning/10">
              <p className="text-sm font-medium text-[var(--app-text)]">
                {openDeployments.length === 1
                  ? 'One open deployment will be ended:'
                  : `${openDeployments.length} open deployments will be ended:`}
              </p>
              <ul className="mt-1 list-inside list-disc text-sm text-[var(--app-text-muted)]">
                {openDeployments.map((d) => (
                  <li key={d.id}>
                    {d.branch_name ?? 'Facility'} — {humanize(d.shift)} shift
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-[var(--app-text-muted)]">
                The facility's headcount will drop accordingly.
              </p>
            </div>
          )}

          <Field label="Type" required>
            <Select
              value={separationStatus}
              onChange={(e) =>
                setSeparationStatus(
                  e.target.value as Extract<EmploymentStatus, 'resigned' | 'terminated'>,
                )
              }
              options={[
                { value: 'resigned', label: 'Resigned' },
                { value: 'terminated', label: 'Terminated' },
              ]}
            />
          </Field>

          <Field
            label="Effective date"
            required
            hint="Cannot be earlier than the date hired."
          >
            <Input
              type="date"
              value={separationDate}
              min={p.date_hired}
              onChange={(e) => setSeparationDate(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </>
  )
}
