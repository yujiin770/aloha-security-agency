import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Printer, RefreshCw, TrendingUp } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
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

function monthsAgo(count: number): string {
  const date = new Date()
  date.setMonth(date.getMonth() - count)
  date.setDate(1)
  return date.toISOString().slice(0, 10)
}

export default function ReportsPage() {
  const toast = useToast()
  const qc = useQueryClient()

  const [from, setFrom] = useState(monthsAgo(11))
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))

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

  const byMonth = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of funnel.data ?? []) {
      map.set(row.period_month, (map.get(row.period_month) ?? 0) + row.total)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [funnel.data])

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

  const peakMonth = Math.max(1, ...byMonth.map(([, count]) => count))
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

      <Card className="no-print mb-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="From" hint="By calendar month">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <div className="flex items-end gap-2 sm:col-span-2">
            {[
              ['3 months', 2],
              ['6 months', 5],
              ['12 months', 11],
            ].map(([label, months]) => (
              <Button
                key={label as string}
                size="sm"
                variant="secondary"
                onClick={() => {
                  setFrom(monthsAgo(months as number))
                  setTo(new Date().toISOString().slice(0, 10))
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs text-[var(--app-text-subtle)]">
          Figures come from a materialized view. If they look stale after a bulk
          change, use “Refresh data”.
        </p>
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
            {[
              ['Applications received', formatNumber(totals.total)],
              ['Hired', formatNumber(totals.hired)],
              ['In progress', formatNumber(totals.inProgress)],
              ['Hire rate', formatPercent(hireRate)],
            ].map(([label, value]) => (
              <Card key={label}>
                <p className="text-sm font-medium text-[var(--app-text-muted)]">
                  {label}
                </p>
                {funnel.isLoading ? (
                  <Skeleton className="mt-2 h-9 w-24" />
                ) : (
                  <p className="mt-1.5 text-3xl font-semibold tracking-tight text-[var(--app-text)] tabular-nums">
                    {value}
                  </p>
                )}
              </Card>
            ))}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {/* Volume by month --------------------------------------------- */}
            <Card padded={false}>
              <CardHeader
                title="Applications by month"
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
                        byMonth.map(([month, count]) => ({ month, count })),
                        [
                          { key: 'month', header: 'Month' },
                          { key: 'count', header: 'Applications' },
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
                ) : byMonth.length === 0 ? (
                  <EmptyState
                    title="No data for this period"
                    description="Try widening the date range."
                    className="py-8"
                  />
                ) : (
                  <div
                    className="flex h-52 items-end gap-1.5"
                    role="img"
                    aria-label={`Applications per month from ${from} to ${to}`}
                  >
                    {byMonth.map(([month, count]) => (
                      <div
                        key={month}
                        className="group flex flex-1 flex-col items-center gap-1.5"
                      >
                        <span className="text-[10px] font-medium text-[var(--app-text-muted)] tabular-nums opacity-0 transition-opacity group-hover:opacity-100">
                          {count}
                        </span>
                        <div
                          className="w-full rounded-t bg-brand-500 transition-colors group-hover:bg-brand-600"
                          style={{
                            height: `${Math.max((count / peakMonth) * 100, 2)}%`,
                          }}
                        />
                        <span className="text-[10px] whitespace-nowrap text-[var(--app-text-subtle)]">
                          {new Date(month).toLocaleDateString('en-PH', {
                            month: 'short',
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
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
                  <ul className="space-y-3">
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
                              className="h-full rounded-full bg-brand-500"
                              style={{ width: `${pct}%` }}
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
                      {['Branch', 'Location', 'Required', 'Deployed', 'Vacancies', 'Fill rate'].map(
                        (header) => (
                          <th
                            key={header}
                            scope="col"
                            className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--app-text-muted)] uppercase"
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
