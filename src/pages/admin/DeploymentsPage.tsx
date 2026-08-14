import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRightLeft, CircleStop, Download, Plus, Search } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { DataTable, type Column, type SortState } from '@/components/DataTable'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { Can } from '@/app/guards'
import { queryKeys } from '@/lib/queryKeys'
import { errorMessage } from '@/lib/errors'
import {
  createDeployment,
  endDeployment,
  listDeployments,
  transferDeployment,
} from '@/features/deployments/api/deploymentsApi'
import { listAvailablePersonnel } from '@/features/personnel/api/personnelApi'
import { listBranchOptions } from '@/features/branches/api/branchesApi'
import { downloadCsv } from '@/features/reports/api/reportsApi'
import {
  DEFAULT_PAGE_SIZE,
  DEPLOYMENT_STATUSES,
  deploymentStatusMeta,
  SHIFTS,
  shiftMeta,
  ADMIN_ROLES,
} from '@/utils/constants'
import { formatCurrency, formatDate } from '@/utils/format'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import type {
  ActiveDeploymentView,
  DeploymentStatus,
  ShiftType,
} from '@/types/database.types'

const today = () => new Date().toISOString().slice(0, 10)

export default function DeploymentsPage() {
  const toast = useToast()
  const qc = useQueryClient()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [status, setStatus] = useState<DeploymentStatus | ''>('active')
  const [branchId, setBranchId] = useState('')
  const [shift, setShift] = useState<ShiftType | ''>('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [sort, setSort] = useState<SortState>({
    column: 'start_date',
    direction: 'desc',
  })

  const [assignOpen, setAssignOpen] = useState(false)
  const [endTarget, setEndTarget] = useState<ActiveDeploymentView | null>(null)
  const [transferTarget, setTransferTarget] = useState<ActiveDeploymentView | null>(null)

  // Assignment form
  const [personnelId, setPersonnelId] = useState('')
  const [assignBranch, setAssignBranch] = useState('')
  const [assignShift, setAssignShift] = useState<ShiftType>('day')
  const [startDate, setStartDate] = useState(today())
  const [post, setPost] = useState('')
  const [rate, setRate] = useState('')

  // End / transfer form
  const [effectiveDate, setEffectiveDate] = useState(today())
  const [reason, setReason] = useState('')
  const [targetBranch, setTargetBranch] = useState('')

  const { data: branches = [] } = useQuery({
    queryKey: queryKeys.branches.options(),
    queryFn: listBranchOptions,
    staleTime: 5 * 60_000,
  })

  const available = useQuery({
    queryKey: queryKeys.personnel.list({ available: true }),
    queryFn: listAvailablePersonnel,
    enabled: assignOpen,
  })

  const params = {
    search: debouncedSearch,
    status,
    branchId,
    shift,
    page,
    pageSize,
    sortColumn: sort.column,
    sortDirection: sort.direction,
  }

  const query = useQuery({
    queryKey: queryKeys.deployments.list(params),
    queryFn: () => listDeployments(params),
    placeholderData: (previous) => previous,
  })

  function invalidateAll() {
    void qc.invalidateQueries({ queryKey: queryKeys.deployments.all })
    void qc.invalidateQueries({ queryKey: queryKeys.personnel.all })
    void qc.invalidateQueries({ queryKey: queryKeys.branches.staffing() })
    void qc.invalidateQueries({ queryKey: queryKeys.reports.dashboard() })
  }

  const assign = useMutation({
    mutationFn: () =>
      createDeployment({
        personnel_id: personnelId,
        branch_id: assignBranch,
        shift: assignShift,
        start_date: startDate,
        post_assignment: post.trim() || null,
        daily_rate: rate ? Number(rate) : null,
      }),
    onSuccess: () => {
      toast.success('Deployment created')
      setAssignOpen(false)
      resetAssignForm()
      invalidateAll()
    },
    onError: (error) => toast.error('Could not create deployment', errorMessage(error)),
  })

  const end = useMutation({
    mutationFn: () =>
      endDeployment({
        id: endTarget!.id,
        endDate: effectiveDate,
        reason: reason.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Deployment ended')
      setEndTarget(null)
      setReason('')
      invalidateAll()
    },
    onError: (error) => toast.error('Could not end deployment', errorMessage(error)),
  })

  const transfer = useMutation({
    mutationFn: () =>
      transferDeployment({
        id: transferTarget!.id,
        targetBranchId: targetBranch,
        effectiveDate,
        reason: reason.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Deployment transferred')
      setTransferTarget(null)
      setTargetBranch('')
      setReason('')
      invalidateAll()
    },
    onError: (error) => toast.error('Could not transfer deployment', errorMessage(error)),
  })

  function resetAssignForm() {
    setPersonnelId('')
    setAssignBranch('')
    setAssignShift('day')
    setStartDate(today())
    setPost('')
    setRate('')
  }

  const columns: Column<ActiveDeploymentView>[] = [
    {
      key: 'personnel',
      header: 'Personnel',
      sortKey: 'personnel_name',
      render: (row) => (
        <div className="min-w-0">
          <Link
            to={`/admin/personnel/${row.personnel_id}`}
            onClick={(e) => e.stopPropagation()}
            className="truncate font-medium text-[var(--app-text)] hover:text-brand-600"
          >
            {row.personnel_name}
          </Link>
          <p className="truncate font-mono text-xs text-[var(--app-text-subtle)]">
            {row.employee_no} · {row.position_name}
            {row.rank_name ? ` · ${row.rank_name}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'branch',
      header: 'Post',
      sortKey: 'branch_name',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-[var(--app-text)]">{row.branch_name}</p>
          <p className="truncate text-xs text-[var(--app-text-subtle)]">
            {row.branch_code}
            {row.post_assignment ? ` · ${row.post_assignment}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'shift',
      header: 'Shift',
      sortKey: 'shift',
      render: (row) => {
        const meta = shiftMeta(row.shift)
        return <Badge tone={meta?.tone ?? 'neutral'}>{meta?.label}</Badge>
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (row) => {
        const meta = deploymentStatusMeta(row.status)
        return (
          <Badge tone={meta?.tone ?? 'neutral'} dot>
            {meta?.label}
          </Badge>
        )
      },
    },
    {
      key: 'period',
      header: 'Period',
      sortKey: 'start_date',
      secondary: true,
      render: (row) => (
        <div className="text-xs whitespace-nowrap">
          <p className="text-[var(--app-text)]">
            {formatDate(row.start_date)} –{' '}
            {row.end_date ? formatDate(row.end_date) : 'present'}
          </p>
          {row.status === 'active' && (
            <p className="text-[var(--app-text-subtle)]">
              {row.days_deployed} day(s)
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'rate',
      header: 'Daily rate',
      secondary: true,
      render: (row) => (
        <span className="text-sm tabular-nums text-[var(--app-text-muted)]">
          {formatCurrency(row.daily_rate)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      render: (row) =>
        row.status === 'active' || row.status === 'pending' ? (
          <Can roles={[...ADMIN_ROLES, 'deployment_officer']}>
            <div className="flex justify-end gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  setTransferTarget(row)
                  setEffectiveDate(today())
                }}
                aria-label={`Transfer ${row.personnel_name}`}
              >
                <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  setEndTarget(row)
                  setEffectiveDate(today())
                }}
                aria-label={`End deployment for ${row.personnel_name}`}
              >
                <CircleStop className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
              </Button>
            </div>
          </Can>
        ) : null,
    },
  ]

  function exportCsv() {
    const rows = query.data?.rows ?? []
    if (rows.length === 0) {
      toast.info('Nothing to export', 'No deployments match the current filters.')
      return
    }
    downloadCsv(
      `deployments-${today()}`,
      rows as unknown as Record<string, unknown>[],
      [
        { key: 'employee_no', header: 'Employee no.' },
        { key: 'personnel_name', header: 'Personnel' },
        { key: 'position_name', header: 'Position' },
        { key: 'rank_name', header: 'Rank' },
        { key: 'branch_code', header: 'Branch code' },
        { key: 'branch_name', header: 'Branch' },
        { key: 'post_assignment', header: 'Post' },
        { key: 'shift', header: 'Shift' },
        { key: 'status', header: 'Status' },
        { key: 'start_date', header: 'Start' },
        { key: 'end_date', header: 'End' },
        { key: 'daily_rate', header: 'Daily rate' },
      ],
    )
    toast.success('Export ready', `${rows.length} row(s) downloaded.`)
  }

  return (
    <>
      <PageHeader
        title="Deployments"
        description="Who is posted where, on which shift, and since when."
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<Download className="h-4 w-4" />}
              onClick={exportCsv}
            >
              Export CSV
            </Button>
            <Can roles={[...ADMIN_ROLES, 'deployment_officer']}>
              <Button
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={() => setAssignOpen(true)}
              >
                Assign personnel
              </Button>
            </Can>
          </>
        }
      />

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
            placeholder="Search personnel or post…"
            aria-label="Search deployments"
            className="h-10 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] pl-9 text-sm text-[var(--app-text)] placeholder:text-[var(--app-text-subtle)]"
          />
        </div>

        <Select
          aria-label="Status"
          placeholder="All statuses"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as DeploymentStatus | '')
            setPage(1)
          }}
          options={DEPLOYMENT_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
        />

        <Select
          aria-label="Branch"
          placeholder="All branches"
          value={branchId}
          onChange={(e) => {
            setBranchId(e.target.value)
            setPage(1)
          }}
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
        />

        <Select
          aria-label="Shift"
          placeholder="All shifts"
          value={shift}
          onChange={(e) => {
            setShift(e.target.value as ShiftType | '')
            setPage(1)
          }}
          options={SHIFTS.map((s) => ({ value: s.value, label: s.label }))}
        />
      </div>

      <DataTable
        caption="Deployments"
        columns={columns}
        rows={query.data?.rows ?? []}
        rowKey={(row) => row.id}
        isLoading={query.isLoading}
        error={query.isError ? errorMessage(query.error) : null}
        onRetry={() => void query.refetch()}
        emptyTitle="No deployments found"
        emptyDescription="Assign active personnel to a branch to create a deployment."
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
      />

      {/* Assign ----------------------------------------------------------- */}
      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Assign personnel to a post"
        description="Only active personnel without a current deployment are listed."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => assign.mutate()}
              isLoading={assign.isPending}
              disabled={!personnelId || !assignBranch}
            >
              Create deployment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label="Personnel"
            required
            hint={
              available.isLoading
                ? 'Loading…'
                : `${available.data?.length ?? 0} available`
            }
          >
            <Select
              placeholder="Select personnel…"
              value={personnelId}
              onChange={(e) => setPersonnelId(e.target.value)}
              options={(available.data ?? []).map((p) => ({
                value: p.id,
                label: `${p.full_name} — ${p.employee_no}`,
              }))}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Branch / post" required>
              <Select
                placeholder="Select branch…"
                value={assignBranch}
                onChange={(e) => setAssignBranch(e.target.value)}
                options={branches.map((b) => ({
                  value: b.id,
                  label: `${b.name} — ${b.city_municipality}`,
                }))}
              />
            </Field>
            <Field label="Shift" required>
              <Select
                value={assignShift}
                onChange={(e) => setAssignShift(e.target.value as ShiftType)}
                options={SHIFTS.map((s) => ({ value: s.value, label: s.label }))}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date" required>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label="Daily rate (₱)" hint="Optional">
              <Input
                type="number"
                min={0}
                step={10}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Specific post" hint="Optional, e.g. Main lobby, Gate 3">
            <Input value={post} onChange={(e) => setPost(e.target.value)} />
          </Field>

          <p className="rounded-lg bg-[var(--app-bg)] p-3 text-xs text-[var(--app-text-muted)]">
            The database rejects overlapping assignments, so a guard cannot be
            double-booked across two posts for the same dates.
          </p>
        </div>
      </Modal>

      {/* End -------------------------------------------------------------- */}
      <Modal
        open={endTarget !== null}
        onClose={() => setEndTarget(null)}
        title="End deployment"
        description={
          endTarget ? `${endTarget.personnel_name} · ${endTarget.branch_name}` : undefined
        }
        size="sm"
        dismissOnOverlayClick={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEndTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => end.mutate()} isLoading={end.isPending}>
              End deployment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="End date" required>
            <Input
              type="date"
              value={effectiveDate}
              min={endTarget?.start_date}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </Field>
          <Field label="Reason" hint="Optional. Recorded in the deployment history.">
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Contract ended"
            />
          </Field>
        </div>
      </Modal>

      {/* Transfer --------------------------------------------------------- */}
      <Modal
        open={transferTarget !== null}
        onClose={() => setTransferTarget(null)}
        title="Transfer to another post"
        description={
          transferTarget
            ? `${transferTarget.personnel_name} · currently at ${transferTarget.branch_name}`
            : undefined
        }
        size="sm"
        dismissOnOverlayClick={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTransferTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => transfer.mutate()}
              isLoading={transfer.isPending}
              disabled={!targetBranch}
            >
              Transfer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="New branch / post" required>
            <Select
              placeholder="Select branch…"
              value={targetBranch}
              onChange={(e) => setTargetBranch(e.target.value)}
              options={branches
                .filter((b) => b.id !== transferTarget?.branch_id)
                .map((b) => ({
                  value: b.id,
                  label: `${b.name} — ${b.city_municipality}`,
                }))}
            />
          </Field>

          <Field label="Effective date" required>
            <Input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </Field>

          <Field label="Reason" hint="Optional">
            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>

          <p className="rounded-lg bg-[var(--app-bg)] p-3 text-xs text-[var(--app-text-muted)]">
            The current assignment is closed the day before the effective date
            and a new one opens at the destination — both are recorded in the
            deployment history.
          </p>
        </div>
      </Modal>
    </>
  )
}
