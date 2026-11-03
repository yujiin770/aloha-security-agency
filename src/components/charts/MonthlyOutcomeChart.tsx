import { useMemo, useState } from 'react'
import { BarChart3, Table2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/Feedback'
import type { MonthBucket } from './monthBuckets'
import { formatNumber } from '@/utils/format'
import { cn } from '@/utils/cn'

/**
 * Applications per month, stacked by where they ended up.
 *
 * Series colours come from the `--color-chart-*` tokens, which were checked
 * for colour-blind separation in both themes. Identity never rests on colour
 * alone: there is always a legend, the tooltip names every segment, and the
 * table view gives the exact figures.
 */

const SERIES = [
  { key: 'hired', label: 'Hired', color: 'var(--color-chart-1)' },
  { key: 'inProgress', label: 'In progress', color: 'var(--color-chart-2)' },
  { key: 'rejected', label: 'Rejected', color: 'var(--color-chart-3)' },
  { key: 'archived', label: 'Archived', color: 'var(--app-text-subtle)' },
] as const

function monthLabel(month: string, style: 'short' | 'long' = 'short') {
  return new Date(`${month.slice(0, 10)}T00:00:00`).toLocaleDateString('en-PH', {
    month: style,
    ...(style === 'long' ? { year: 'numeric' } : {}),
  })
}

/** A "nice" axis maximum: 1, 2 or 5 times a power of ten. */
function niceMax(value: number) {
  if (value <= 4) return 4
  const power = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 5, 10].find((n) => n * power >= value) ?? 10
  return step * power
}

export function MonthlyOutcomeChart({
  data,
  height = 220,
  label,
}: {
  data: MonthBucket[]
  height?: number
  /** Accessible description, e.g. "Applications per month, last six months". */
  label: string
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const [hovered, setHovered] = useState<string | null>(null)

  const grandTotal = useMemo(() => data.reduce((sum, b) => sum + b.total, 0), [data])
  const max = niceMax(Math.max(0, ...data.map((b) => b.total)))
  const ticks = [max, max / 2, 0]

  if (grandTotal === 0) {
    return (
      <EmptyState
        title="No applications in this period"
        description="Monthly volumes will chart here as applications arrive."
        icon={<BarChart3 className="h-6 w-6" aria-hidden="true" />}
        className="py-10"
      />
    )
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Legend">
          {SERIES.map((series) => (
            <li
              key={series.key}
              className="flex items-center gap-1.5 text-xs text-[var(--app-text-muted)]"
            >
              <span
                className="h-2.5 w-2.5 rounded-[3px]"
                style={{ background: series.color }}
                aria-hidden="true"
              />
              {series.label}
            </li>
          ))}
        </ul>
        <div
          className="flex rounded-lg border border-[var(--app-border)] p-0.5"
          role="group"
          aria-label="Display as"
        >
          {(
            [
              ['chart', 'Chart', BarChart3],
              ['table', 'Table', Table2],
            ] as const
          ).map(([value, text, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setView(value)}
              aria-pressed={view === value}
              className={cn(
                'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                view === value
                  ? 'bg-[var(--app-bg)] text-[var(--app-text)]'
                  : 'text-[var(--app-text-subtle)] hover:text-[var(--app-text)]',
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {text}
            </button>
          ))}
        </div>
      </div>

      {view === 'table' ? (
        <div className="scrollbar-slim overflow-x-auto rounded-lg border border-[var(--app-border)]">
          <table className="w-full text-sm">
            <caption className="sr-only">{label}</caption>
            <thead>
              <tr className="bg-[var(--app-bg)]">
                {['Month', ...SERIES.map((s) => s.label), 'Total'].map((header, index) => (
                  <th
                    key={header}
                    scope="col"
                    className={cn(
                      'px-3 py-2 text-[11px] font-semibold tracking-wider text-[var(--app-text-muted)] uppercase',
                      index === 0 ? 'text-left' : 'text-right',
                    )}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((bucket) => (
                <tr key={bucket.month} className="border-t border-[var(--app-border)]">
                  <th scope="row" className="px-3 py-2 text-left font-medium text-[var(--app-text)]">
                    {monthLabel(bucket.month, 'long')}
                  </th>
                  {SERIES.map((series) => (
                    <td key={series.key} className="px-3 py-2 text-right tabular-nums text-[var(--app-text-muted)]">
                      {formatNumber(bucket[series.key])}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--app-text)]">
                    {formatNumber(bucket.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex gap-2" role="img" aria-label={label}>
          {/* Y axis: three recessive ticks are enough to read a volume. */}
          <div
            className="relative w-7 shrink-0 text-right text-[10px] tabular-nums text-[var(--app-text-subtle)]"
            style={{ height }}
            aria-hidden="true"
          >
            {ticks.map((tick, index) => (
              <span
                key={tick}
                className="absolute right-0 -translate-y-1/2"
                style={{ top: `${(index / (ticks.length - 1)) * 100}%` }}
              >
                {formatNumber(tick)}
              </span>
            ))}
          </div>

          <div className="min-w-0 flex-1">
            <div className="relative" style={{ height }}>
              {ticks.map((tick, index) => (
                <div
                  key={tick}
                  className={cn(
                    'absolute inset-x-0 border-t',
                    tick === 0
                      ? 'border-[var(--app-text-subtle)]/40'
                      : 'border-dashed border-[var(--app-border)]',
                  )}
                  style={{ top: `${(index / (ticks.length - 1)) * 100}%` }}
                  aria-hidden="true"
                />
              ))}

              <div className="absolute inset-0 flex items-end gap-[6%] px-[2%]">
                {data.map((bucket) => {
                  const isHovered = hovered === bucket.month
                  return (
                    <div
                      key={bucket.month}
                      className="relative flex h-full flex-1 items-end justify-center"
                      // The hit target is the whole column, not the thin bar.
                      onMouseEnter={() => setHovered(bucket.month)}
                      onMouseLeave={() => setHovered(null)}
                      onFocus={() => setHovered(bucket.month)}
                      onBlur={() => setHovered(null)}
                      tabIndex={0}
                      aria-label={`${monthLabel(bucket.month, 'long')}: ${bucket.total} applications`}
                    >
                      <div
                        className={cn(
                          'flex w-full max-w-12 flex-col-reverse gap-[2px] transition-opacity',
                          hovered && !isHovered && 'opacity-50',
                        )}
                        style={{ height: `${(bucket.total / max) * 100}%` }}
                      >
                        {SERIES.map((series, index) => {
                          const value = bucket[series.key]
                          if (value === 0) return null
                          const isTop = SERIES.slice(index + 1).every((s) => bucket[s.key] === 0)
                          return (
                            <div
                              key={series.key}
                              className={cn('w-full', isTop && 'rounded-t')}
                              style={{ flexGrow: value, flexBasis: 0, background: series.color, minHeight: 2 }}
                            />
                          )
                        })}
                      </div>

                      {isHovered && (
                        <div
                          role="tooltip"
                          className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-44 -translate-x-1/2 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-3 text-xs shadow-[var(--shadow-raised)]"
                        >
                          <p className="mb-1.5 font-semibold text-[var(--app-text)]">
                            {monthLabel(bucket.month, 'long')}
                          </p>
                          <ul className="space-y-1">
                            {SERIES.map((series) => (
                              <li key={series.key} className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-1.5 text-[var(--app-text-muted)]">
                                  <span
                                    className="h-2 w-2 rounded-[2px]"
                                    style={{ background: series.color }}
                                    aria-hidden="true"
                                  />
                                  {series.label}
                                </span>
                                <span className="tabular-nums text-[var(--app-text)]">
                                  {formatNumber(bucket[series.key])}
                                </span>
                              </li>
                            ))}
                          </ul>
                          <p className="mt-1.5 flex justify-between border-t border-[var(--app-border)] pt-1.5 font-semibold text-[var(--app-text)]">
                            Total <span className="tabular-nums">{formatNumber(bucket.total)}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="mt-2 flex gap-[6%] px-[2%]" aria-hidden="true">
              {data.map((bucket) => (
                <span
                  key={bucket.month}
                  className="flex-1 truncate text-center text-[11px] text-[var(--app-text-subtle)]"
                >
                  {monthLabel(bucket.month)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
