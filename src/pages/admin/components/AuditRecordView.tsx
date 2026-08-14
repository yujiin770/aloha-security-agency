import { useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/Badge'
import { queryKeys } from '@/lib/queryKeys'
import { listBranchOptions } from '@/features/branches/api/branchesApi'
import { usePositionLookup, useRankLookup } from '@/features/config/hooks/useConfig'
import {
  CURRENCY_FIELDS,
  DATE_ONLY,
  ENUM_SHAPED,
  HIDDEN_FIELDS,
  MASKED_FIELDS,
  TIMESTAMP,
  UUID,
  fieldLabel,
  statusBadge,
} from '@/utils/auditFields'
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatFileSize,
  humanize,
  maskId,
} from '@/utils/format'
import type { Json } from '@/types/database.types'

/**
 * Renders an audit log's captured row the way the rest of the app renders that
 * data — labelled fields, badges for statuses, names for foreign keys, masked
 * statutory numbers — instead of the raw `to_jsonb(new)` dump the trigger
 * writes.
 *
 * The raw JSON is still one click away, because when you are reading an audit
 * log to settle a dispute you occasionally need the literal bytes.
 */

const EMPTY = '—'

interface Lookups {
  position: (id: string) => string | undefined
  rank: (id: string) => string | undefined
  branch: (id: string) => string | undefined
}

function useLookups(): Lookups {
  const positions = usePositionLookup()
  const ranks = useRankLookup()
  const branches = useQuery({
    queryKey: queryKeys.branches.options(),
    queryFn: listBranchOptions,
    staleTime: 5 * 60_000,
  })

  const branchMap = useMemo(
    () => new Map((branches.data ?? []).map((b) => [b.id, b.name])),
    [branches.data],
  )

  return {
    position: (id) => positions.byId(id)?.name,
    rank: (id) => ranks.byId(id)?.name,
    branch: (id) => branchMap.get(id),
  }
}

/**
 * One field's value as a node. Returns `null` for values that have no sensible
 * flat rendering (objects and arrays), which the caller renders as a sub-list.
 */
function renderScalar(
  table: string,
  key: string,
  value: unknown,
  lookups: Lookups,
): ReactNode {
  if (value === null || value === undefined || value === '') return EMPTY
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'

  if (typeof value === 'number') {
    if (CURRENCY_FIELDS.has(key)) return formatCurrency(value)
    if (key === 'file_size') return formatFileSize(value)
    return String(value)
  }

  if (typeof value === 'string') {
    if (MASKED_FIELDS.has(key)) return maskId(value)

    const badge = statusBadge(table, key, value)
    if (badge) {
      return (
        <Badge tone={badge.tone} size="sm">
          {badge.label}
        </Badge>
      )
    }

    if (UUID.test(value)) {
      const resolved =
        key === 'position_id'
          ? lookups.position(value)
          : key === 'rank_id'
            ? lookups.rank(value)
            : key === 'branch_id' || key === 'preferred_branch_id'
              ? lookups.branch(value)
              : undefined
      if (resolved) return resolved
      // An unresolved id is still worth showing, just not pretending to be prose.
      return <span className="font-mono text-[11px] break-all">{value}</span>
    }

    if (TIMESTAMP.test(value)) return formatDateTime(value)
    if (DATE_ONLY.test(value)) return formatDate(value)

    // Free text must survive untouched, so only enum-shaped strings are
    // title-cased.
    if (ENUM_SHAPED.test(value)) return humanize(value)

    return value
  }

  return null
}

export function AuditValue({
  table,
  fieldKey,
  value,
}: {
  table: string
  fieldKey: string
  value: unknown
}) {
  const lookups = useLookups()
  const scalar = renderScalar(table, fieldKey, value, lookups)
  if (scalar !== null) return <>{scalar}</>

  if (Array.isArray(value)) {
    if (value.length === 0) return <>{EMPTY}</>
    return (
      <ul className="list-inside list-disc space-y-0.5">
        {value.map((item, index) => (
          <li key={index}>
            {renderScalar(table, fieldKey, item, lookups) ?? JSON.stringify(item)}
          </li>
        ))}
      </ul>
    )
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return <>{EMPTY}</>
    return (
      <ul className="space-y-0.5">
        {entries.map(([k, v]) => (
          <li key={k}>
            <span className="text-[var(--app-text-muted)]">{fieldLabel(k)}: </span>
            {renderScalar(table, k, v, lookups) ?? JSON.stringify(v)}
          </li>
        ))}
      </ul>
    )
  }

  return <>{EMPTY}</>
}

export function AuditRecordView({
  table,
  data,
  title,
}: {
  table: string
  data: Json | null
  title: string
}) {
  const record = (data ?? {}) as Record<string, unknown>
  const entries = Object.entries(record).filter(([key]) => !HIDDEN_FIELDS.has(key))

  if (entries.length === 0) {
    return (
      <p className="text-sm text-[var(--app-text-muted)]">
        No field detail was captured for this entry.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium tracking-wide text-[var(--app-text-subtle)] uppercase">
        {title}
      </h3>

      <div className="overflow-hidden rounded-lg border border-[var(--app-border)]">
        <table className="w-full text-sm">
          <tbody>
            {entries.map(([key, value], index) => (
              <tr
                key={key}
                className={index > 0 ? 'border-t border-[var(--app-border)]' : undefined}
              >
                <th
                  scope="row"
                  className="w-2/5 bg-[var(--app-bg)] px-3 py-2 text-left align-top text-xs font-medium text-[var(--app-text-muted)]"
                >
                  {fieldLabel(key)}
                </th>
                <td className="px-3 py-2 align-top text-xs break-words text-[var(--app-text)]">
                  <AuditValue table={table} fieldKey={key} value={value} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RawJson data={data} />
    </div>
  )
}

export function RawJson({ data }: { data: Json | null }) {
  return (
    <details>
      <summary className="cursor-pointer text-xs text-[var(--app-text-muted)] hover:text-[var(--app-text)]">
        View raw JSON
      </summary>
      <pre className="scrollbar-slim mt-2 max-h-72 overflow-auto rounded-lg bg-ink p-4 font-mono text-xs text-neutral-300">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  )
}
