import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Eye, ShieldCheck } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { queryKeys } from '@/lib/queryKeys'
import { errorMessage } from '@/lib/errors'
import { downloadCsv, listAuditLogs } from '@/features/reports/api/reportsApi'
import { AuditRecordView, AuditValue, RawJson } from './components/AuditRecordView'
import { fieldLabel } from '@/utils/auditFields'
import { DEFAULT_PAGE_SIZE } from '@/utils/constants'
import { formatDateTime, humanize } from '@/utils/format'
import type { AuditLogRow, Json } from '@/types/database.types'

const TABLES = [
  'applicants',
  'applicant_documents',
  'branches',
  'personnel',
  'deployments',
  'profiles',
  'user_roles',
  'settings',
]

const ACTION_TONES = {
  insert: 'success',
  update: 'info',
  delete: 'danger',
} as const

export default function AuditPage() {
  const toast = useToast()

  const [tableName, setTableName] = useState('')
  const [action, setAction] = useState<'insert' | 'update' | 'delete' | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [inspecting, setInspecting] = useState<AuditLogRow | null>(null)

  const params = {
    tableName,
    action,
    from: from || undefined,
    // Include the whole of the end day, not just its first instant.
    to: to ? `${to}T23:59:59.999Z` : undefined,
    page,
    pageSize,
  }

  const query = useQuery({
    queryKey: queryKeys.audit.list(params),
    queryFn: () => listAuditLogs(params),
    placeholderData: (previous) => previous,
  })

  const columns: Column<AuditLogRow>[] = [
    {
      key: 'when',
      header: 'When',
      render: (row) => (
        <span className="text-sm whitespace-nowrap text-[var(--app-text)]">
          {formatDateTime(row.created_at)}
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (row) => (
        <span className="text-sm text-[var(--app-text-muted)]">
          {row.actor_email ?? 'System'}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <Badge tone={ACTION_TONES[row.action]} size="sm">
          {humanize(row.action)}
        </Badge>
      ),
    },
    {
      key: 'table',
      header: 'Record',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-[var(--app-text)]">
            {humanize(row.table_name)}
          </p>
          <p className="truncate font-mono text-[11px] text-[var(--app-text-subtle)]">
            {row.record_id?.slice(0, 8) ?? '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'changed',
      header: 'Fields changed',
      secondary: true,
      render: (row) =>
        row.changed_keys && row.changed_keys.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {row.changed_keys.slice(0, 3).map((key) => (
              <Badge key={key} size="sm">
                {key}
              </Badge>
            ))}
            {row.changed_keys.length > 3 && (
              <Badge size="sm">+{row.changed_keys.length - 3}</Badge>
            )}
          </div>
        ) : (
          <span className="text-sm text-[var(--app-text-subtle)]">—</span>
        ),
    },
    {
      key: 'inspect',
      header: <span className="sr-only">Inspect</span>,
      render: (row) => (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setInspecting(row)}
            aria-label="Inspect this change"
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      ),
    },
  ]

  function exportCsv() {
    const rows = query.data?.rows ?? []
    if (rows.length === 0) {
      toast.info('Nothing to export', 'No audit entries match the current filters.')
      return
    }
    downloadCsv(
      `audit-log-${new Date().toISOString().slice(0, 10)}`,
      rows as unknown as Record<string, unknown>[],
      [
        { key: 'created_at', header: 'Timestamp' },
        { key: 'actor_email', header: 'Actor' },
        { key: 'action', header: 'Action' },
        { key: 'table_name', header: 'Table' },
        { key: 'record_id', header: 'Record ID' },
      ],
    )
    toast.success('Export ready', `${rows.length} row(s) downloaded.`)
  }

  return (
    <>
      <PageHeader
        title="Audit logs"
        description="Every insert, update and delete against the operational tables."
        actions={
          <Button variant="secondary" onClick={exportCsv}>
            Export CSV
          </Button>
        }
      />

      <Card className="mb-4 border-info/25 bg-info-soft">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-info" aria-hidden="true" />
          <p className="text-sm text-[var(--app-text-muted)]">
            This log is append-only. No role — including owner — has an update or
            delete policy on it, and entries are written by a database trigger
            rather than the application, so a client cannot forge or erase one.
          </p>
        </div>
      </Card>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Table">
          <Select
            placeholder="All tables"
            value={tableName}
            onChange={(e) => {
              setTableName(e.target.value)
              setPage(1)
            }}
            options={TABLES.map((t) => ({ value: t, label: humanize(t) }))}
          />
        </Field>
        <Field label="Action">
          <Select
            placeholder="All actions"
            value={action}
            onChange={(e) => {
              setAction(e.target.value as typeof action)
              setPage(1)
            }}
            options={[
              { value: 'insert', label: 'Insert' },
              { value: 'update', label: 'Update' },
              { value: 'delete', label: 'Delete' },
            ]}
          />
        </Field>
        <Field label="From">
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              setPage(1)
            }}
          />
        </Field>
        <Field label="To">
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              setPage(1)
            }}
          />
        </Field>
      </div>

      <DataTable
        caption="Audit log"
        columns={columns}
        rows={query.data?.rows ?? []}
        rowKey={(row) => String(row.id)}
        isLoading={query.isLoading}
        error={query.isError ? errorMessage(query.error) : null}
        onRetry={() => void query.refetch()}
        emptyTitle="No audit entries"
        emptyDescription="Changes to applicants, personnel, deployments and settings will appear here."
        page={page}
        pageSize={pageSize}
        totalCount={query.data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
      />

      <Modal
        open={inspecting !== null}
        onClose={() => setInspecting(null)}
        title="Change detail"
        description={
          inspecting
            ? `${humanize(inspecting.action)} on ${humanize(inspecting.table_name)} · ${formatDateTime(inspecting.created_at)}`
            : undefined
        }
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setInspecting(null)}>
            Close
          </Button>
        }
      >
        {inspecting && (
          <div className="space-y-4">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium tracking-wide text-[var(--app-text-subtle)] uppercase">
                  Actor
                </dt>
                <dd className="text-sm text-[var(--app-text)]">
                  {inspecting.actor_email ?? 'System'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium tracking-wide text-[var(--app-text-subtle)] uppercase">
                  Record ID
                </dt>
                <dd className="font-mono text-xs break-all text-[var(--app-text)]">
                  {inspecting.record_id ?? '—'}
                </dd>
              </div>
            </dl>

            {inspecting.action === 'update' && inspecting.changed_keys ? (
              <DiffTable
                table={inspecting.table_name}
                keys={inspecting.changed_keys}
                oldData={inspecting.old_data}
                newData={inspecting.new_data}
              />
            ) : (
              <AuditRecordView
                table={inspecting.table_name}
                data={
                  inspecting.action === 'delete' ? inspecting.old_data : inspecting.new_data
                }
                title={
                  inspecting.action === 'delete' ? 'Deleted record' : 'Created record'
                }
              />
            )}
          </div>
        )}
      </Modal>
    </>
  )
}

function DiffTable({
  table,
  keys,
  oldData,
  newData,
}: {
  table: string
  keys: string[]
  oldData: Json | null
  newData: Json | null
}) {
  const before = (oldData ?? {}) as Record<string, unknown>
  const after = (newData ?? {}) as Record<string, unknown>

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-[var(--app-border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--app-bg)]">
              <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--app-text-muted)] uppercase">
                Field
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--app-text-muted)] uppercase">
                Before
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--app-text-muted)] uppercase">
                After
              </th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key} className="border-t border-[var(--app-border)]">
                <td className="px-3 py-2 align-top text-xs font-medium text-[var(--app-text)]">
                  {fieldLabel(key)}
                </td>
                <td className="px-3 py-2 align-top text-xs break-words text-danger">
                  <AuditValue table={table} fieldKey={key} value={before[key]} />
                </td>
                <td className="px-3 py-2 align-top text-xs break-words text-success">
                  <AuditValue table={table} fieldKey={key} value={after[key]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RawJson data={newData} />
    </div>
  )
}
