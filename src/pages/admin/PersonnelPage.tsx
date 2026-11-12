import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Download,
  MapPinned,
  Search,
  ShieldAlert,
  UserCheck,
  UserPlus,
  UsersRound,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { DataTable, type Column, type SortState } from '@/components/DataTable'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Field, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { StatCard } from '@/components/ui/Feedback'
import { fetchDashboardStats } from '@/features/reports/api/reportsApi'
import { queryKeys } from '@/lib/queryKeys'
import { errorMessage } from '@/lib/errors'
import { listPersonnel } from '@/features/personnel/api/personnelApi'
import { AddPersonnelDialog } from '@/features/personnel/components/AddPersonnelDialog'
import { Can } from '@/app/guards'
import { listBranchOptions } from '@/features/branches/api/branchesApi'
import { downloadCsv } from '@/features/reports/api/reportsApi'
import {
  ADMIN_ROLES,
  DEFAULT_PAGE_SIZE,
  EMPLOYMENT_STATUSES,
  employmentStatusMeta,
} from '@/utils/constants'
import { usePositions } from '@/features/config/hooks/useConfig'
import { formatDate } from '@/utils/format'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import type { EmploymentStatus, PersonnelRosterView } from '@/types/database.types'

export default function PersonnelPage() {
  const navigate = useNavigate()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [status, setStatus] = useState<EmploymentStatus | ''>('active')
  const [addOpen, setAddOpen] = useState(false)
  const [positionId, setPositionId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [sort, setSort] = useState<SortState>({
    column: 'full_name',
    direction: 'asc',
  })

  const { data: branches = [] } = useQuery({
    queryKey: queryKeys.branches.options(),
    queryFn: listBranchOptions,
    staleTime: 5 * 60_000,
  })

  const { data: positions = [] } = usePositions(true)

  const params = {
    search: debouncedSearch,
    status,
    positionId,
    branchId,
    page,
    pageSize,
    sortColumn: sort.column,
    sortDirection: sort.direction,
  }

  const query = useQuery({
    queryKey: queryKeys.personnel.list(params),
    queryFn: () => listPersonnel(params),
    placeholderData: (previous) => previous,
  })

  const columns: Column<PersonnelRosterView>[] = [
    {
      key: 'person',
      header: 'Personnel',
      sortKey: 'full_name',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-[var(--app-text)]">
            {row.full_name}
          </p>
          <p className="truncate font-mono text-xs text-[var(--app-text-subtle)]">
            {row.employee_no}
          </p>
        </div>
      ),
    },
    {
      key: 'position',
      header: 'Position',
      sortKey: 'position_name',
      render: (row) => (
        <div>
          <Badge tone={row.position_tone}>{row.position_name}</Badge>
          {row.rank_name && (
            <p className="mt-1 text-xs text-[var(--app-text-subtle)]">
              {row.rank_name}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'employment_status',
      render: (row) => {
        const meta = employmentStatusMeta(row.employment_status)
        return (
          <Badge tone={meta?.tone ?? 'neutral'} dot>
            {meta?.label}
          </Badge>
        )
      },
    },
    {
      key: 'deployment',
      header: 'Current post',
      render: (row) =>
        row.current_branch_name ? (
          <div className="min-w-0">
            <p className="truncate text-sm text-[var(--app-text)]">
              {row.current_branch_name}
            </p>
            <p className="text-xs text-[var(--app-text-subtle)] capitalize">
              {row.current_shift} shift · since {formatDate(row.current_start_date)}
            </p>
          </div>
        ) : (
          <Badge tone="warning" size="sm">
            Unassigned
          </Badge>
        ),
    },
    {
      key: 'licence',
      header: 'Licence',
      secondary: true,
      render: (row) =>
        row.security_license_no ? (
          <div className="min-w-0">
            <p className="truncate font-mono text-xs text-[var(--app-text)]">
              {row.security_license_no}
            </p>
            <p
              className={
                row.license_expiring_soon
                  ? 'flex items-center gap-1 text-xs font-medium text-warning'
                  : 'text-xs text-[var(--app-text-subtle)]'
              }
            >
              {row.license_expiring_soon && (
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              )}
              {formatDate(row.security_license_expiry)}
            </p>
          </div>
        ) : (
          <span className="text-sm text-[var(--app-text-subtle)]">—</span>
        ),
    },
    {
      key: 'hired',
      header: 'Hired',
      sortKey: 'date_hired',
      secondary: true,
      render: (row) => (
        <span className="text-sm whitespace-nowrap text-[var(--app-text-muted)]">
          {formatDate(row.date_hired)}
        </span>
      ),
    },
  ]

  function exportCsv() {
    const rows = query.data?.rows ?? []
    if (rows.length === 0) {
      toast.info('Nothing to export', 'No personnel match the current filters.')
      return
    }
    downloadCsv(
      `personnel-${new Date().toISOString().slice(0, 10)}`,
      rows as unknown as Record<string, unknown>[],
      [
        { key: 'employee_no', header: 'Employee no.' },
        { key: 'full_name', header: 'Name' },
        { key: 'position_name', header: 'Position' },
        { key: 'rank_name', header: 'Rank' },
        { key: 'employment_status', header: 'Status' },
        { key: 'current_branch_name', header: 'Current post' },
        { key: 'current_shift', header: 'Shift' },
        { key: 'security_license_no', header: 'Licence no.' },
        { key: 'security_license_expiry', header: 'Licence expiry' },
        { key: 'date_hired', header: 'Date hired' },
      ],
    )
    toast.success('Export ready', `${rows.length} row(s) downloaded.`)
  }

  // Shares the dashboard's cache entry, so arriving from the dashboard costs
  // no extra request.
  const stats = useQuery({
    queryKey: queryKeys.reports.dashboard(),
    queryFn: fetchDashboardStats,
  })
  const p = stats.data?.personnel

  return (
    <>
      <PageHeader
        title="Personnel roster"
        description="Everyone currently employed, and where they're posted."
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<Download className="h-4 w-4" />}
              onClick={exportCsv}
            >
              Export CSV
            </Button>
            {/* Mirrors personnel_insert: administrators and HR. */}
            <Can roles={[...ADMIN_ROLES, 'hr_staff']}>
              <Button leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
                Add existing personnel
              </Button>
            </Can>
          </>
        }
      />

      <AddPersonnelDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onResume={() => setAddOpen(true)}
      />

      {!stats.isError && (
        <section aria-label="Roster summary" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={UsersRound}
            label="Total personnel"
            value={p?.total ?? 0}
            caption="Every record on the roster"
            isLoading={stats.isLoading}
          />
          <StatCard
            icon={UserCheck}
            tone="success"
            label="Available"
            value={Math.max(0, (p?.active ?? 0) - (p?.deployed ?? 0))}
            caption={`${p?.active ?? 0} active, not on a post`}
            isLoading={stats.isLoading}
          />
          <StatCard
            icon={MapPinned}
            tone="info"
            label="Currently deployed"
            value={p?.deployed ?? 0}
            caption="On an active deployment"
            to="/admin/deployments"
            isLoading={stats.isLoading}
          />
          <StatCard
            icon={ShieldAlert}
            tone={(p?.license_expiring ?? 0) > 0 ? 'warning' : 'neutral'}
            label="Licences expiring"
            value={p?.license_expiring ?? 0}
            caption="Within the next 60 days"
            isLoading={stats.isLoading}
          />
        </section>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--app-text-subtle)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Search name or employee no…"
            aria-label="Search personnel"
            className="h-10 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] pr-3 pl-9 text-sm text-[var(--app-text)] shadow-[0_1px_1px_rgb(15_23_42/0.03)] transition-[border-color,box-shadow] placeholder:text-[var(--app-text-subtle)] focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/15 focus:outline-none"
          />
        </div>

        <Field label="">
          <Select
            aria-label="Employment status"
            placeholder="All statuses"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as EmploymentStatus | '')
              setPage(1)
            }}
            options={EMPLOYMENT_STATUSES.map((s) => ({
              value: s.value,
              label: s.label,
            }))}
          />
        </Field>

        <Field label="">
          <Select
            aria-label="Position"
            placeholder="All positions"
            value={positionId}
            onChange={(e) => {
              setPositionId(e.target.value)
              setPage(1)
            }}
            options={positions.map((p) => ({ value: p.id, label: p.name }))}
          />
        </Field>

        <Field label="">
          <Select
            aria-label="Facility"
            placeholder="All facilities"
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value)
              setPage(1)
            }}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
          />
        </Field>
      </div>

      <DataTable
        caption="Personnel roster"
        columns={columns}
        rows={query.data?.rows ?? []}
        rowKey={(row) => row.id}
        isLoading={query.isLoading}
        error={query.isError ? errorMessage(query.error) : null}
        onRetry={() => void query.refetch()}
        emptyTitle="No personnel found"
        emptyDescription="Personnel appear here once an applicant is hired from the recruitment pipeline."
        sort={sort}
        onSortChange={setSort}
        page={page}
        pageSize={pageSize}
        totalCount={query.data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        onRowClick={(row) => navigate(`/admin/personnel/${row.id}`)}
      />
    </>
  )
}
