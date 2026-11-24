import { useQuery } from '@tanstack/react-query'
import { Gavel } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { queryKeys } from '@/lib/queryKeys'
import { errorMessage } from '@/lib/errors'
import { listPersonnelActions } from '@/features/personnel/api/personnelApi'
import { personnelActionMeta } from '@/utils/constants'
import { formatDate, formatDateTime } from '@/utils/format'

/** Violations / offenses and every status change, each with its reason and effectivity date. */
export function PersonnelActionLog({ personnelId }: { personnelId: string }) {
  const actions = useQuery({
    queryKey: queryKeys.personnel.actions(personnelId),
    queryFn: () => listPersonnelActions(personnelId),
    enabled: Boolean(personnelId),
  })

  const rows = actions.data ?? []
  const violations = rows.filter((a) => a.action_type === 'violation').length

  return (
    <Card padded={false}>
      <CardHeader
        title="Violations and status history"
        description={`${violations} violation(s) · ${rows.length - violations} status change(s)`}
        icon={<Gavel className="h-4 w-4" aria-hidden="true" />}
      />
      {actions.isLoading ? (
        <p className="p-5 text-sm text-[var(--app-text-muted)]">Loading…</p>
      ) : actions.isError ? (
        <p className="p-5 text-sm text-danger">{errorMessage(actions.error)}</p>
      ) : rows.length === 0 ? (
        <p className="p-5 text-sm text-[var(--app-text-muted)]">
          No violations or status changes recorded.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--app-border)]">
          {rows.map((a) => {
            const meta = personnelActionMeta(a.action_type)
            return (
              <li key={a.id} className="px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={meta?.tone ?? 'neutral'} size="sm">
                    {meta?.label ?? a.action_type}
                  </Badge>
                  {a.offense && (
                    <span className="text-sm font-medium text-[var(--app-text)]">
                      {a.offense}
                    </span>
                  )}
                  <span className="ml-auto text-xs whitespace-nowrap text-[var(--app-text-subtle)]">
                    Effective {formatDate(a.effective_date)}
                    {a.end_date ? ` – ${formatDate(a.end_date)}` : ''}
                  </span>
                </div>
                <p className="mt-1.5 text-sm whitespace-pre-line text-[var(--app-text-muted)]">
                  {a.reason}
                </p>
                {a.details && (
                  <p className="mt-1 text-xs text-[var(--app-text-subtle)]">{a.details}</p>
                )}
                <p className="mt-1 text-xs text-[var(--app-text-subtle)]">
                  Recorded {formatDateTime(a.created_at)}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
