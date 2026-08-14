import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Building2,
  ClipboardList,
  MapPinned,
  TrendingUp,
  UsersRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { queryKeys } from '@/lib/queryKeys'
import { errorMessage } from '@/lib/errors'
import { fetchDashboardStats, listActivity } from '@/features/reports/api/reportsApi'
import { listBranchStaffing } from '@/features/branches/api/branchesApi'
import { useAuth } from '@/contexts/AuthContext'
import { APPLICANT_STATUSES } from '@/utils/constants'
import { formatNumber, formatRelative } from '@/utils/format'
import { cn } from '@/utils/cn'

export default function DashboardPage() {
  const { user } = useAuth()

  const stats = useQuery({
    queryKey: queryKeys.reports.dashboard(),
    queryFn: fetchDashboardStats,
  })

  const staffing = useQuery({
    queryKey: queryKeys.branches.staffing(),
    queryFn: listBranchStaffing,
  })

  const activity = useQuery({
    queryKey: queryKeys.audit.activity({ limit: 12 }),
    queryFn: () => listActivity(12),
  })

  const firstName = user?.profile.first_name ?? user?.profile.full_name.split(' ')[0]

  return (
    <>
      <PageHeader
        title={firstName ? `Good day, ${firstName}` : 'Dashboard'}
        description="Recruitment pipeline, personnel and deployment status at a glance."
      />

      {stats.isError ? (
        <Card>
          <ErrorState
            message={errorMessage(stats.error)}
            onRetry={() => void stats.refetch()}
          />
        </Card>
      ) : (
        <>
          {/* KPI tiles ------------------------------------------------------ */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              icon={ClipboardList}
              label="Applicants"
              value={stats.data?.applicants.total}
              caption={`${formatNumber(stats.data?.applicants.new_this_month ?? 0)} new this month`}
              to="/admin/applicants"
              isLoading={stats.isLoading}
            />
            <StatTile
              icon={UsersRound}
              label="Active personnel"
              value={stats.data?.personnel.active}
              caption={`${formatNumber(stats.data?.personnel.deployed ?? 0)} currently deployed`}
              to="/admin/personnel"
              isLoading={stats.isLoading}
            />
            <StatTile
              icon={MapPinned}
              label="Active deployments"
              value={stats.data?.deployments.active}
              caption={`${formatNumber(stats.data?.deployments.ending_soon ?? 0)} ending within 14 days`}
              to="/admin/deployments"
              isLoading={stats.isLoading}
            />
            <StatTile
              icon={Building2}
              label="Open posts"
              value={stats.data?.branches.vacancies}
              caption={`across ${formatNumber(stats.data?.branches.active ?? 0)} active facilities`} 
              to="/admin/facilities" 
              tone="warning"
              isLoading={stats.isLoading}
            />
          </div>

          {/* Licence expiry warning ----------------------------------------- */}
          {(stats.data?.personnel.license_expiring ?? 0) > 0 && (
            <Card className="mt-4 border-warning/40 bg-warning-soft">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  className="mt-0.5 h-5 w-5 shrink-0 text-warning"
                  aria-hidden="true"
                />
                <div>
                  <h2 className="text-sm font-semibold text-amber-800">
                    {stats.data!.personnel.license_expiring} security licence
                    {stats.data!.personnel.license_expiring === 1 ? '' : 's'} expiring
                    within 60 days
                  </h2>
                  <p className="mt-0.5 text-sm text-amber-900/80">
                    Deploying a guard on a lapsed LESP/SOSIA licence is a
                    compliance breach.{' '}
                    <Link to="/admin/personnel" className="font-medium underline">
                      Review the roster
                    </Link>
                    .
                  </p>
                </div>
              </div>
            </Card>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            {/* Pipeline ---------------------------------------------------- */}
            <Card padded={false} className="lg:col-span-2">
              <CardHeader
                title="Recruitment pipeline"
                description="Where every applicant currently sits"
                icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
              />
              <div className="p-5">
                {stats.isLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-10" />
                    ))}
                  </div>
                ) : (
                  <PipelineBars
                    counts={{
                      pending: stats.data?.applicants.pending ?? 0,
                      screening: stats.data?.applicants.screening ?? 0,
                      interview: stats.data?.applicants.interview ?? 0,
                      hired: stats.data?.applicants.hired ?? 0,
                      rejected: stats.data?.applicants.rejected ?? 0,
                    }}
                  />
                )}
              </div>
            </Card>

            {/* Activity ---------------------------------------------------- */}
            <Card padded={false}>
              <CardHeader title="Recent activity" />
              <div className="scrollbar-slim max-h-[22rem] overflow-y-auto">
                {activity.isLoading ? (
                  <div className="space-y-3 p-5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-8" />
                    ))}
                  </div>
                ) : (activity.data?.length ?? 0) === 0 ? (
                  <EmptyState
                    title="Nothing yet"
                    description="Hires, deployments and other actions will show up here."
                    className="py-10"
                  />
                ) : (
                  <ul className="divide-y divide-[var(--app-border)]">
                    {activity.data!.map((entry) => (
                      <li key={entry.id} className="px-5 py-3">
                        <p className="text-sm text-[var(--app-text)]">
                          {entry.summary}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--app-text-subtle)]">
                          {formatRelative(entry.created_at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          </div>

          {/* Staffing ---------------------------------------------------- */}
          <Card padded={false} className="mt-6">
            <CardHeader
              title="Facility staffing"
              description="Deployed headcount against requirement"
              icon={<Building2 className="h-4 w-4" aria-hidden="true" />}
              actions={
                <Link
                  to="/admin/facilities"
                  className="text-sm font-medium text-brand-600 hover:underline"
                >
                  View all
                </Link>
              }
            />
            {staffing.isLoading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : (staffing.data?.length ?? 0) === 0 ? (
              <EmptyState
                title="No facilities yet"
                description="Add a facility to start assigning personnel."
              />
            ) : (
              <ul className="divide-y divide-[var(--app-border)]">
                {staffing.data!
                  .filter((branch) => branch.is_active)
                  .slice(0, 8)
                  .map((branch) => {
                    const fill = branch.fill_rate_pct ?? 0
                    return (
                      <li
                        key={branch.branch_id}
                        className="flex flex-wrap items-center gap-4 px-5 py-3.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[var(--app-text)]">
                            {branch.name}
                          </p>
                          <p className="truncate text-xs text-[var(--app-text-subtle)]">
                            {branch.code} · {branch.city_municipality}
                          </p>
                        </div>

                        <div className="flex w-40 shrink-0 items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--app-border)]">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                fill >= 100
                                  ? 'bg-success'
                                  : fill >= 70
                                    ? 'bg-warning'
                                    : 'bg-danger',
                              )}
                              style={{ width: `${Math.min(fill, 100)}%` }}
                            />
                          </div>
                          <span className="w-20 shrink-0 text-right text-xs tabular-nums text-[var(--app-text-muted)]">
                            {branch.deployed_count}/{branch.required_headcount}
                          </span>
                        </div>

                        {branch.vacancy_count > 0 && (
                          <Badge tone="warning" size="sm">
                            {branch.vacancy_count} open
                          </Badge>
                        )}
                      </li>
                    )
                  })}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  )
}

/* -------------------------------------------------------------------------- */

function StatTile({
  icon: Icon,
  label,
  value,
  caption,
  to,
  tone = 'brand',
  isLoading,
}: {
  icon: LucideIcon
  label: string
  value: number | undefined
  caption: string
  to: string
  tone?: 'brand' | 'warning'
  isLoading?: boolean
}) {
  return (
    <Link
      to={to}
      className="group rounded-[var(--radius-card)] border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-[var(--shadow-card)] transition-colors hover:border-brand-500"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-[var(--app-text-muted)]">{label}</p>
        <span
          className={cn(
            'rounded-lg p-2',
            tone === 'warning'
              ? 'bg-warning-soft text-warning'
              : 'bg-brand-50 text-brand-600 dark:bg-brand-900/25',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>

      {isLoading ? (
        <Skeleton className="mt-3 h-9 w-20" />
      ) : (
        <p className="mt-2 text-3xl font-semibold tracking-tight text-[var(--app-text)] tabular-nums">
          {formatNumber(value ?? 0)}
        </p>
      )}
      <p className="mt-1 text-xs text-[var(--app-text-subtle)]">{caption}</p>
    </Link>
  )
}

function PipelineBars({ counts }: { counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0)
  const stages = APPLICANT_STATUSES.filter((s) => s.value in counts)

  if (total === 0) {
    return (
      <EmptyState
        title="No applications yet"
        description="Submissions from the public site will appear here."
        className="py-8"
      />
    )
  }

  const TONE_BG: Record<string, string> = {
    neutral: 'bg-neutral-400',
    info: 'bg-info',
    warning: 'bg-warning',
    success: 'bg-success',
    danger: 'bg-danger',
    brand: 'bg-brand-500',
    laurel: 'bg-laurel-500',
  }

  return (
    <ul className="space-y-3">
      {stages.map((stage) => {
        const count = counts[stage.value] ?? 0
        const pct = total === 0 ? 0 : (count / total) * 100
        return (
          <li key={stage.value}>
            <div className="flex items-baseline justify-between gap-3">
              <Link
                to={`/admin/applicants?status=${stage.value}`}
                className="text-sm font-medium text-[var(--app-text)] hover:text-brand-600"
              >
                {stage.label}
              </Link>
              <span className="text-sm tabular-nums text-[var(--app-text-muted)]">
                {formatNumber(count)}{' '}
                <span className="text-xs text-[var(--app-text-subtle)]">
                  ({pct.toFixed(0)}%)
                </span>
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--app-border)]">
              <div
                className={cn('h-full rounded-full', TONE_BG[stage.tone])}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
