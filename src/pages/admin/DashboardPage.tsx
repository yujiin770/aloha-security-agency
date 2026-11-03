import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  Database,
  Hourglass,
  MapPinned,
  Radio,
  ShieldAlert,
  UserCheck,
  UserX,
  UsersRound,
  Wifi,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, ErrorState, Skeleton, StatCard } from '@/components/ui/Feedback'
import { MonthlyOutcomeChart } from '@/components/charts/MonthlyOutcomeChart'
import { bucketByMonth } from '@/components/charts/monthBuckets'
import { queryKeys } from '@/lib/queryKeys'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import {
  fetchDashboardStats,
  fetchRecruitmentFunnel,
  listActivity,
} from '@/features/reports/api/reportsApi'
import { listBranchStaffing } from '@/features/branches/api/branchesApi'
import { useAuth } from '@/contexts/AuthContext'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { formatNumber, formatRelative } from '@/utils/format'
import { cn } from '@/utils/cn'

/** First of the month, `count` months back, as an ISO date. */
function monthsAgo(count: number): string {
  const date = new Date()
  date.setDate(1)
  date.setMonth(date.getMonth() - count)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function DashboardPage() {
  const { user, isAdmin } = useAuth()

  const stats = useQuery({
    queryKey: queryKeys.reports.dashboard(),
    queryFn: fetchDashboardStats,
  })

  const staffing = useQuery({
    queryKey: queryKeys.branches.staffing(),
    queryFn: listBranchStaffing,
  })

  // Six calendar months including this one, from the analytics view.
  const chartFrom = monthsAgo(5)
  const chartTo = new Date().toISOString().slice(0, 10)
  const funnel = useQuery({
    queryKey: queryKeys.reports.funnel({ from: chartFrom, to: chartTo }),
    queryFn: () => fetchRecruitmentFunnel({ from: chartFrom, to: chartTo }),
  })

  // Activity and system health are for administrators; staff never fetch them.
  const activity = useQuery({
    queryKey: queryKeys.audit.activity({ limit: 12 }),
    queryFn: () => listActivity(12),
    enabled: isAdmin,
  })

  const firstName = user?.profile.first_name ?? user?.profile.full_name.split(' ')[0]
  const s = stats.data

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          firstName
            ? `${greeting()}, ${firstName}. Here is today's recruitment and deployment overview.`
            : "Today's recruitment and deployment overview."
        }
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
          <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <StatCard
              icon={ClipboardList}
              label="Total Applicants"
              value={formatNumber(s?.applicants.total ?? 0)}
              caption={`${formatNumber(s?.applicants.new_this_month ?? 0)} new this month`}
              to="/admin/applicants"
              isLoading={stats.isLoading}
            />
            <StatCard
              icon={Hourglass}
              tone="warning"
              label="Pending Applications"
              value={formatNumber(s?.applicants.pending ?? 0)}
              caption={`+${formatNumber(s?.applicants.screening ?? 0)} in screening`}
              to="/admin/applicants?status=pending"
              isLoading={stats.isLoading}
            />
            <StatCard
              icon={CalendarClock}
              tone="info"
              label="For Interview"
              value={formatNumber(s?.applicants.interview ?? 0)}
              caption="Awaiting or in interview"
              to="/admin/applicants?status=interview"
              isLoading={stats.isLoading}
            />
            <StatCard
              icon={UserCheck}
              tone="success"
              label="Hired Personnel"
              value={formatNumber(s?.applicants.hired ?? 0)}
              caption={`${formatNumber(s?.personnel.active ?? 0)} active on the roster`}
              to="/admin/applicants?status=hired"
              isLoading={stats.isLoading}
            />
            <StatCard
              icon={MapPinned}
              tone="primary"
              label="Active Deployments"
              value={formatNumber(s?.deployments.active ?? 0)}
              caption={`${formatNumber(s?.deployments.ending_soon ?? 0)} ending within 14 days`}
              to="/admin/deployments"
              isLoading={stats.isLoading}
            />
            <StatCard
              icon={UserX}
              tone="danger"
              label="Rejected Applicants"
              value={formatNumber(s?.applicants.rejected ?? 0)}
              caption="Not proceeding"
              to="/admin/applicants?status=rejected"
              isLoading={stats.isLoading}
            />
          </section>

          {/* Licence expiry warning ----------------------------------------- */}
          {(s?.personnel.license_expiring ?? 0) > 0 && (
            <div
              role="status"
              className="mt-4 flex items-start gap-3 rounded-[var(--radius-card)] border border-warning/30 bg-warning-soft p-4 dark:bg-warning/10"
            >
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  {s!.personnel.license_expiring} security licence
                  {s!.personnel.license_expiring === 1 ? '' : 's'} expiring within 60 days
                </h2>
                <p className="mt-0.5 text-sm text-amber-900/80 dark:text-amber-200/80">
                  Deploying a guard on a lapsed LESP/SOSIA licence is a compliance breach.{' '}
                  <Link to="/admin/personnel" className="font-medium underline">
                    Review the roster
                  </Link>
                  .
                </p>
              </div>
            </div>
          )}

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            {/* Recruitment analytics ------------------------------------------ */}
            <Card padded={false} className="xl:col-span-2">
              <CardHeader
                title="Recruitment analytics"
                description="Applications received per month over the last six months, by outcome"
                icon={<BarChart3 className="h-4 w-4" aria-hidden="true" />}
                actions={
                  <Link
                    to="/admin/reports"
                    className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
                  >
                    Full report
                  </Link>
                }
              />
              <div className="p-5">
                {funnel.isLoading ? (
                  <Skeleton className="h-64" />
                ) : funnel.isError ? (
                  <ErrorState
                    title="Analytics unavailable"
                    message={errorMessage(funnel.error)}
                    onRetry={() => void funnel.refetch()}
                    className="py-10"
                  />
                ) : (
                  <MonthlyOutcomeChart
                    data={bucketByMonth(funnel.data ?? [], chartFrom, chartTo)}
                    label="Applications per month over the last six months, stacked by outcome"
                  />
                )}
              </div>
            </Card>

            {/* Workforce snapshot ------------------------------------------- */}
            <Card padded={false}>
              <CardHeader
                title="Workforce"
                description="Personnel and facility coverage"
                icon={<UsersRound className="h-4 w-4" aria-hidden="true" />}
              />
              <dl className="divide-y divide-[var(--app-border)]">
                {(
                  [
                    [UsersRound, 'Active personnel', s?.personnel.active, '/admin/personnel'],
                    [MapPinned, 'Currently deployed', s?.personnel.deployed, '/admin/deployments'],
                    [Building2, 'Active facilities', s?.branches.active, '/admin/facilities'],
                    [ShieldAlert, 'Open posts', s?.branches.vacancies, '/admin/facilities'],
                    [Activity, 'Deployments this month', s?.deployments.new_this_month, '/admin/deployments'],
                  ] as [LucideIcon, string, number | undefined, string][]
                ).map(([Icon, label, value, to]) => (
                  <div key={label} className="flex items-center justify-between gap-3 px-5 py-3">
                    <dt className="flex items-center gap-2.5 text-sm text-[var(--app-text-muted)]">
                      <Icon className="h-4 w-4 text-[var(--app-text-subtle)]" aria-hidden="true" />
                      <Link to={to} className="hover:text-[var(--app-text)] hover:underline">
                        {label}
                      </Link>
                    </dt>
                    <dd className="text-sm font-semibold tabular-nums text-[var(--app-text)]">
                      {stats.isLoading ? <Skeleton className="h-4 w-8" /> : formatNumber(value ?? 0)}
                    </dd>
                  </div>
                ))}
              </dl>
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
                  className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
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
            ) : staffing.isError ? (
              <ErrorState
                message={errorMessage(staffing.error)}
                onRetry={() => void staffing.refetch()}
                className="py-10"
              />
            ) : (staffing.data?.filter((b) => b.is_active).length ?? 0) === 0 ? (
              <EmptyState
                title="No active facilities yet"
                description="Add a facility to start assigning personnel."
              />
            ) : (
              <ul className="grid divide-y divide-[var(--app-border)] md:grid-cols-2 md:divide-y-0">
                {staffing.data!
                  .filter((branch) => branch.is_active)
                  .slice(0, 8)
                  .map((branch) => (
                    <li
                      key={branch.branch_id}
                      className="border-[var(--app-border)] px-5 py-3.5 md:border-b md:odd:border-r"
                    >
                      <StaffingRow
                        name={branch.name}
                        meta={[branch.code, branch.city_municipality].filter(Boolean).join(' · ')}
                        deployed={branch.deployed_count}
                        required={branch.required_headcount}
                        fill={branch.fill_rate_pct ?? 0}
                        vacancies={branch.vacancy_count}
                      />
                    </li>
                  ))}
              </ul>
            )}
          </Card>

          {isAdmin && (
            <div className="mt-6 grid gap-6 xl:grid-cols-3">
              {/* Activity ---------------------------------------------------- */}
              <Card padded={false} className="xl:col-span-2">
                <CardHeader
                  title="Recent activity"
                  description="Latest actions across the console"
                  icon={<Clock className="h-4 w-4" aria-hidden="true" />}
                  actions={
                    <Link
                      to="/admin/audit"
                      className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
                    >
                      Audit logs
                    </Link>
                  }
                />
                <div className="scrollbar-slim max-h-[24rem] overflow-y-auto">
                  {activity.isLoading ? (
                    <div className="space-y-3 p-5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-8" />
                      ))}
                    </div>
                  ) : activity.isError ? (
                    <ErrorState
                      message={errorMessage(activity.error)}
                      onRetry={() => void activity.refetch()}
                      className="py-10"
                    />
                  ) : (activity.data?.length ?? 0) === 0 ? (
                    <EmptyState
                      title="Nothing yet"
                      description="Hires, deployments and other actions will show up here."
                      className="py-10"
                    />
                  ) : (
                    <ol className="relative px-5 py-4">
                      {activity.data!.map((entry, index) => (
                        <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
                          {/* Timeline rail */}
                          {index < activity.data!.length - 1 && (
                            <span
                              className="absolute top-4 bottom-0 left-[5px] w-px bg-[var(--app-border)]"
                              aria-hidden="true"
                            />
                          )}
                          <span
                            className="relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-brand-500 bg-[var(--app-surface)] dark:border-brand-300"
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <p className="text-sm text-[var(--app-text)]">{entry.summary}</p>
                            <p className="mt-0.5 text-xs text-[var(--app-text-subtle)]">
                              <time dateTime={entry.created_at}>{formatRelative(entry.created_at)}</time>
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </Card>

              <SystemHealth statsUpdatedAt={stats.dataUpdatedAt} />
            </div>
          )}
        </>
      )}
    </>
  )
}

/* -------------------------------------------------------------------------- */

function StaffingRow({
  name,
  meta,
  deployed,
  required,
  fill,
  vacancies,
}: {
  name: string
  meta: string
  deployed: number
  required: number
  fill: number
  vacancies: number
}) {
  const tone = fill >= 100 ? 'bg-success' : fill >= 70 ? 'bg-warning' : 'bg-danger'
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--app-text)]">{name}</p>
          <p className="truncate text-xs text-[var(--app-text-subtle)]">{meta}</p>
        </div>
        {vacancies > 0 ? (
          <Badge tone="warning" size="sm">
            {vacancies} open
          </Badge>
        ) : (
          <Badge tone="success" size="sm">
            Fully staffed
          </Badge>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--app-border)]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={required}
          aria-valuenow={Math.min(deployed, required)}
          aria-label={`${name} staffing`}
        >
          <div className={cn('h-full rounded-full', tone)} style={{ width: `${Math.min(fill, 100)}%` }} />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-[var(--app-text-muted)]">
          {deployed}/{required} · {Math.round(fill)}%
        </span>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

interface HealthProbe {
  latencyMs: number
  realtime: boolean
}

/**
 * A real round trip, timed. A head-only count returns no rows, so this costs
 * the database next to nothing while still exercising auth, RLS and the API.
 */
async function probeHealth(): Promise<HealthProbe> {
  const started = performance.now()
  const { error } = await supabase
    .from('activity_logs')
    .select('id', { count: 'exact', head: true })
    .limit(1)
  if (error) throw error
  return {
    latencyMs: Math.round(performance.now() - started),
    realtime: supabase.realtime.isConnected(),
  }
}

type HealthState = 'ok' | 'warn' | 'down' | 'unknown'

const HEALTH_STYLE: Record<HealthState, { icon: LucideIcon; className: string; label: string }> = {
  ok: { icon: CheckCircle2, className: 'text-success', label: 'Operational' },
  warn: { icon: AlertTriangle, className: 'text-warning', label: 'Degraded' },
  down: { icon: XCircle, className: 'text-danger', label: 'Unavailable' },
  unknown: { icon: Clock, className: 'text-[var(--app-text-subtle)]', label: 'Checking' },
}

/**
 * Only signals this browser can actually measure. Storage and backups live in
 * the Supabase project, which the app has no read access to, so this says so
 * rather than inventing a figure.
 */
function SystemHealth({ statsUpdatedAt }: { statsUpdatedAt: number }) {
  const online = useOnlineStatus()
  const probe = useQuery({
    queryKey: ['system', 'health'],
    queryFn: probeHealth,
    refetchInterval: 60_000,
    retry: false,
  })

  const database: HealthState = probe.isLoading
    ? 'unknown'
    : probe.isError
      ? 'down'
      : (probe.data?.latencyMs ?? 0) > 1500
        ? 'warn'
        : 'ok'

  const rows: { icon: LucideIcon; label: string; state: HealthState; detail: string }[] = [
    {
      icon: Wifi,
      label: 'Network',
      state: online ? 'ok' : 'down',
      detail: online ? 'Connected' : 'This device is offline',
    },
    {
      icon: Database,
      label: 'Database & API',
      state: database,
      detail: probe.data ? `${probe.data.latencyMs} ms round trip` : probe.isError ? 'Not responding' : '—',
    },
    {
      icon: Radio,
      label: 'Live updates',
      state: probe.isLoading ? 'unknown' : probe.data?.realtime ? 'ok' : 'warn',
      detail: probe.data?.realtime ? 'Realtime channel connected' : 'Reconnecting…',
    },
  ]

  return (
    <Card padded={false}>
      <CardHeader
        title="System health"
        description="Measured from this session"
        icon={<Activity className="h-4 w-4" aria-hidden="true" />}
      />
      <ul className="divide-y divide-[var(--app-border)]">
        {rows.map((row) => {
          const style = HEALTH_STYLE[row.state]
          return (
            <li key={row.label} className="flex items-center gap-3 px-5 py-3">
              <row.icon className="h-4 w-4 shrink-0 text-[var(--app-text-subtle)]" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--app-text)]">{row.label}</p>
                <p className="truncate text-xs text-[var(--app-text-subtle)]">{row.detail}</p>
              </div>
              <span className={cn('flex items-center gap-1 text-xs font-medium', style.className)}>
                <style.icon className="h-3.5 w-3.5" aria-hidden="true" />
                {style.label}
              </span>
            </li>
          )
        })}
      </ul>
      <div className="space-y-1 border-t border-[var(--app-border)] px-5 py-3 text-xs text-[var(--app-text-subtle)]">
        {statsUpdatedAt > 0 && (
          <p>Figures refreshed {formatRelative(new Date(statsUpdatedAt).toISOString())}.</p>
        )}
        <p>Storage usage, backups and maintenance windows are managed in the Supabase project dashboard.</p>
      </div>
    </Card>
  )
}
