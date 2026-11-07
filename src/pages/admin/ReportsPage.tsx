import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileStack,
  Hourglass,
  Percent,
  Printer,
  RefreshCw,
  TrendingUp,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { EmptyState, ErrorState, Skeleton, StatCard } from '@/components/ui/Feedback'
import { MonthlyOutcomeChart } from '@/components/charts/MonthlyOutcomeChart'
import { bucketByMonth } from '@/components/charts/monthBuckets'
import { useToast } from '@/components/ui/Toast'
import { Can } from '@/app/guards'
import { queryKeys } from '@/lib/queryKeys'
import { errorMessage } from '@/lib/errors'
import {
  downloadCsv,
  fetchRecruitmentFunnel,
  refreshAnalytics,
} from '@/features/reports/api/reportsApi'
import { listBranchStaffing } from '@/features/branches/api/branchesApi'
import { formatNumber, formatPercent } from '@/utils/format'
import { cn } from '@/utils/cn'
import { ADMIN_ROLES } from '@/utils/constants'

/** A local date as YYYY-MM-DD. `toISOString()` would shift it to UTC, which
 *  in the Philippines rolls the 1st back to the previous month before 8am. */
function isoDate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

function today(): string {
  return isoDate(new Date())
}

/** First day of the month `count` months back, so the range covers whole months. */
function monthsAgo(count: number): string {
  const date = new Date()
  date.setDate(1)
  date.setMonth(date.getMonth() - count)
  return isoDate(date)
}

/** "Dec 2025" — the summary under the range reads in months, like the chart. */
function formatMonth(value: string): string {
  const [y, m] = value.split('-').map(Number)
  if (!y || !m) return value
  return new Date(y, m - 1, 1).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })
}

/** `months` counts back from the current month, which is itself included. */
const RANGE_PRESETS = [
  { label: '3 months', months: 2 },
  { label: '6 months', months: 5 },
  { label: '12 months', months: 11 },
] as const

export default function ReportsPage() {
  const toast = useToast()
  const qc = useQueryClient()

  const [from, setFrom] = useState(monthsAgo(11))
  const [to, setTo] = useState(today)

  // Which quick range matches the current dates, if any — otherwise "Custom".
  const activePreset =
    to === today()
      ? (RANGE_PRESETS.find((p) => monthsAgo(p.months) === from)?.months ?? null)
      : null

  const funnel = useQuery({
    queryKey: queryKeys.reports.funnel({ from, to }),
    queryFn: () => fetchRecruitmentFunnel({ from, to }),
  })

  const staffing = useQuery({
    queryKey: queryKeys.branches.staffing(),
    queryFn: listBranchStaffing,
  })

  const refresh = useMutation({
    mutationFn: refreshAnalytics,
    onSuccess: () => {
      toast.success('Analytics refreshed')
      void qc.invalidateQueries({ queryKey: queryKeys.reports.all })
    },
    onError: (error) => toast.error('Could not refresh analytics', errorMessage(error)),
  })

  /** Roll the per-month, per-position rows up into totals for the summary cards. */
  const totals = useMemo(() => {
    const rows = funnel.data ?? []
    return rows.reduce(
      (acc, row) => ({
        total: acc.total + row.total,
        hired: acc.hired + row.hired,
        rejected: acc.rejected + row.rejected,
        inProgress:
          acc.inProgress + row.pending + row.screening + row.interview,
      }),
      { total: 0, hired: 0, rejected: 0, inProgress: 0 },
    )
  }, [funnel.data])

  const byMonth = useMemo(
    () => bucketByMonth(funnel.data ?? [], from, to),
    [funnel.data, from, to],
  )

  // Keyed by the position name the view joins in, so a renamed position shows
  // its current name without needing a separate lookup.
  const byPosition = useMemo(() => {
    const map = new Map<string, { total: number; hired: number }>()
    for (const row of funnel.data ?? []) {
      const current = map.get(row.position_name) ?? { total: 0, hired: 0 }
      map.set(row.position_name, {
        total: current.total + row.total,
        hired: current.hired + row.hired,
      })
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total)
  }, [funnel.data])

  const hireRate = totals.total === 0 ? 0 : (totals.hired / totals.total) * 100

  return (
    <>
      <PageHeader
        title="Reports"
        description="Recruitment throughput and branch staffing over a chosen period."
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<Printer className="h-4 w-4" />}
              onClick={() => window.print()}
              className="no-print"
            >
              Print
            </Button>
            <Can roles={[...ADMIN_ROLES]}>
              <Button
                variant="secondary"
                leftIcon={<RefreshCw className="h-4 w-4" />}
                onClick={() => refresh.mutate()}
                isLoading={refresh.isPending}
                className="no-print"
              >
                Refresh data
              </Button>
            </Can>
          </>
        }
      />

      <Card className="no-print mb-6" padded={false}>
        <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Quick ranges. The active one is highlighted, so the control also
              tells you which period you're looking at. */}
          <div
            role="group"
            aria-label="Quick range"
            className="inline-flex w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-1 sm:w-auto"
          >
            {RANGE_PRESETS.map((preset) => {
              const active = activePreset === preset.months
              return (
                <button
                  key={preset.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setFrom(monthsAgo(preset.months))
                    setTo(today())
                  }}
                  className={cn(
                    'flex-1 rounded-md px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors sm:flex-none',
                    active
                      ? 'bg-[var(--app-surface)] text-[var(--app-text)] shadow-[var(--shadow-card)]'
                      : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]',
                  )}
                >
                  {preset.label}
                </button>
              )
            })}
            <span
              aria-hidden={activePreset !== null}
              className={cn(
                'flex-1 rounded-md px-3.5 py-1.5 text-center text-sm font-medium whitespace-nowrap sm:flex-none',
                activePreset === null
                  ? 'bg-[var(--app-surface)] text-[var(--app-text)] shadow-[var(--shadow-card)]'
                  : 'text-[var(--app-text-subtle)]',
              )}
            >
              Custom
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Field label="From" className="flex-1 sm:w-44 sm:flex-none [&>label]:sr-only">
              <Input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <ArrowRight
              className="h-4 w-4 shrink-0 text-[var(--app-text-subtle)]"
              aria-hidden="true"
            />
            <Field label="To" className="flex-1 sm:w-44 sm:flex-none [&>label]:sr-only">
              <Input
                type="date"
                value={to}
                min={from}
                max={today()}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className="flex flex-col gap-1 border-t border-[var(--app-border)] px-4 py-2.5 text-xs text-[var(--app-text-subtle)] sm:flex-row sm:items-center sm:justify-between">
          <p>
            Showing{' '}
            <span className="font-medium text-[var(--app-text-muted)]">
              {formatMonth(from)} – {formatMonth(to)}
            </span>{' '}
            · grouped by calendar month
          </p>
          <p>Numbers look out of date? Use “Refresh data”.</p>
        </div>
      </Card>

      {funnel.isError ? (
        <Card>
          <ErrorState
            message={errorMessage(funnel.error)}
            onRetry={() => void funnel.refetch()}
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={FileStack}
              label="Applications received"
              value={formatNumber(totals.total)}
              isLoading={funnel.isLoading}
            />
            <StatCard
              icon={CheckCircle2}
              tone="success"
              label="Hired"
              value={formatNumber(totals.hired)}
              isLoading={funnel.isLoading}
            />
            <StatCard
              icon={Hourglass}
              tone="warning"
              label="In progress"
              value={formatNumber(totals.inProgress)}
              caption="Pending, screening or interview"
              isLoading={funnel.isLoading}
            />
            <StatCard
              icon={Percent}
              tone="info"
              label="Hire rate"
              value={formatPercent(hireRate)}
              caption="Hired ÷ applications received"
              isLoading={funnel.isLoading}
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {/* Volume by month --------------------------------------------- */}
            <Card padded={false}>
              <CardHeader
                title="Applications by month"
                description="Stacked by outcome"
                icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
                actions={
                  <Button
                    size="sm"
                    variant="ghost"
                    className="no-print"
                    leftIcon={<Download className="h-3.5 w-3.5" />}
                    onClick={() =>
                      downloadCsv(
                        'applications-by-month',
                        byMonth as unknown as Record<string, unknown>[],
                        [
                          { key: 'month', header: 'Month' },
                          { key: 'total', header: 'Applications' },
                          { key: 'hired', header: 'Hired' },
                          { key: 'inProgress', header: 'In progress' },
                          { key: 'rejected', header: 'Rejected' },
                          { key: 'archived', header: 'Archived' },
                        ],
                      )
                    }
                  >
                    CSV
                  </Button>
                }
              />
              <div className="p-5">
                {funnel.isLoading ? (
                  <Skeleton className="h-52" />
                ) : (
                  <MonthlyOutcomeChart
                    data={byMonth}
                    height={208}
                    label={`Applications per month from ${from} to ${to}, stacked by outcome`}
                  />
                )}
              </div>
            </Card>

            {/* By position -------------------------------------------------- */}
            <Card padded={false}>
              <CardHeader title="Applications by position" />
              <div className="p-5">
                {funnel.isLoading ? (
                  <Skeleton className="h-52" />
                ) : byPosition.length === 0 ? (
                  <EmptyState title="No data for this period" className="py-8" />
                ) : (
                  <ul className="space-y-3.5">
                    {byPosition.map(([position, stats]) => {
                      const pct =
                        totals.total === 0 ? 0 : (stats.total / totals.total) * 100
                      return (
                        <li key={position}>
                          <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="text-[var(--app-text)]">{position}</span>
                            <span className="tabular-nums text-[var(--app-text-muted)]">
                              {formatNumber(stats.total)}
                              <span className="ml-1.5 text-xs text-[var(--app-text-subtle)]">
                                {stats.hired} hired
                              </span>
                            </span>
                          </div>
                          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--app-border)]">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, background: 'var(--color-chart-1)' }}
                            />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </Card>
          </div>

          {/* Staffing report --------------------------------------------- */}
          <Card padded={false} className="mt-6">
            <CardHeader
              title="Branch staffing report"
              description="Deployed headcount against requirement, by post"
              actions={
                <Button
                  size="sm"
                  variant="ghost"
                  className="no-print"
                  leftIcon={<Download className="h-3.5 w-3.5" />}
                  onClick={() =>
                    downloadCsv(
                      'branch-staffing',
                      (staffing.data ?? []) as unknown as Record<string, unknown>[],
                      [
                        { key: 'code', header: 'Code' },
                        { key: 'name', header: 'Branch' },
                        { key: 'city_municipality', header: 'City' },
                        { key: 'region', header: 'Region' },
                        { key: 'required_headcount', header: 'Required' },
                        { key: 'deployed_count', header: 'Deployed' },
                        { key: 'vacancy_count', header: 'Vacancies' },
                        { key: 'fill_rate_pct', header: 'Fill rate %' },
                        { key: 'coordinator_name', header: 'Coordinator' },
                      ],
                    )
                  }
                >
                  CSV
                </Button>
              }
            />
            {staffing.isLoading ? (
              <div className="space-y-2 p-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : (staffing.data?.length ?? 0) === 0 ? (
              <EmptyState title="No facilities yet" />
            ) : (
              <div className="scrollbar-slim overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--app-bg)]">
                      {['Facility', 'Location', 'Required', 'Deployed', 'Vacancies', 'Fill rate'].map(
                        (header) => (
                          <th
                            key={header}
                            scope="col"
                            className="px-4 py-2.5 text-left text-[11px] font-semibold tracking-wider text-[var(--app-text-muted)] uppercase"
                          >
                            {header}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {staffing.data!.map((branch) => (
                      <tr
                        key={branch.branch_id}
                        className="border-t border-[var(--app-border)]"
                      >
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-[var(--app-text)]">
                            {branch.name}
                          </p>
                          <p className="font-mono text-xs text-[var(--app-text-subtle)]">
                            {branch.code}
                          </p>
                        </td>
                        <td className="px-4 py-2.5 text-[var(--app-text-muted)]">
                          {[branch.city_municipality, branch.region]
                            .filter(Boolean)
                            .join(', ')}
                        </td>
                        <td className="px-4 py-2.5 tabular-nums">
                          {branch.required_headcount}
                        </td>
                        <td className="px-4 py-2.5 tabular-nums">
                          {branch.deployed_count}
                        </td>
                        <td className="px-4 py-2.5 tabular-nums">
                          {branch.vacancy_count > 0 ? (
                            <span className="font-medium text-warning">
                              {branch.vacancy_count}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td
                          className={cn(
                            'px-4 py-2.5 font-medium tabular-nums',
                            (branch.fill_rate_pct ?? 0) >= 100
                              ? 'text-success'
                              : (branch.fill_rate_pct ?? 0) >= 70
                                ? 'text-warning'
                                : 'text-danger',
                          )}
                        >
                          {formatPercent(branch.fill_rate_pct)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  )
}
