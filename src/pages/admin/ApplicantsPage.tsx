import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, Search, SlidersHorizontal, X } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { DataTable, type Column, type SortState } from '@/components/DataTable'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Field, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { queryKeys } from '@/lib/queryKeys'
import { errorMessage } from '@/lib/errors'
import { listApplicants } from '@/features/applicants/api/applicantsApi'
import { listBranchOptions } from '@/features/branches/api/branchesApi'
import { downloadCsv } from '@/features/reports/api/reportsApi'
import {
  APPLICANT_STATUSES,
  applicantStatusMeta,
  DEFAULT_PAGE_SIZE,
} from '@/utils/constants'
import { usePositions } from '@/features/config/hooks/useConfig'
import { formatDate, formatRelative } from '@/utils/format'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import type { ApplicantStatus, ApplicantSummaryView } from '@/types/database.types'

export default function ApplicantsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [sort, setSort] = useState<SortState>({
    column: 'created_at',
    direction: 'desc',
  })

  // Status lives in the URL so the dashboard can deep-link into a filtered view
  // and the browser back button behaves the way people expect.
  const status = (searchParams.get('status') ?? '') as ApplicantStatus | ''
  const positionId = searchParams.get('position') ?? ''
  const branchId = searchParams.get('branch') ?? ''

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
    setPage(1)
  }

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
    queryKey: queryKeys.applicants.list(params),
    queryFn: () => listApplicants(params),
    placeholderData: (previous) => previous,
  })

  const activeFilterCount = [status, positionId, branchId].filter(Boolean).length

  const columns: Column<ApplicantSummaryView>[] = [
    {
      key: 'applicant',
      header: 'Applicant',
      sortKey: 'last_name',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-[var(--app-text)]">
            {row.full_name}
          </p>
          <p className="truncate font-mono text-xs text-[var(--app-text-subtle)]">
            {row.reference_no}
          </p>
        </div>
      ),
    },
    {
      key: 'position',
      header: 'Position',
      sortKey: 'position_name',
      // The view joins the name and tone, so no client-side lookup is needed.
      render: (row) => <Badge tone={row.position_tone}>{row.position_name}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (row) => {
        const meta = applicantStatusMeta(row.status)
        return (
          <Badge tone={meta?.tone ?? 'neutral'} dot>
            {meta?.label}
          </Badge>
        )
      },
    },
    {
      key: 'contact',
      header: 'Contact',
      secondary: true,
      render: (row) => (
        <div className="min-w-0 text-xs">
          <p className="truncate text-[var(--app-text)]">{row.email}</p>
          <p className="truncate text-[var(--app-text-subtle)]">{row.phone}</p>
        </div>
      ),
    },
    {
      key: 'branch',
      header: 'Preferred branch',
      secondary: true,
      render: (row) => (
        <span className="text-sm text-[var(--app-text-muted)]">
          {row.preferred_branch_name ?? '—'}
        </span>
      ),
    },
    {
      key: 'documents',
      header: 'Docs',
      secondary: true,
      render: (row) => (
        <span className="inline-flex items-center gap-1 text-sm text-[var(--app-text-muted)]">
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          {row.verified_document_count}/{row.document_count}
        </span>
      ),
    },
    {
      key: 'submitted',
      header: 'Submitted',
      sortKey: 'created_at',
      render: (row) => (
        <span
          className="text-sm whitespace-nowrap text-[var(--app-text-muted)]"
          title={formatDate(row.created_at)}
        >
          {formatRelative(row.created_at)}
        </span>
      ),
    },
  ]

  function exportCsv() {
    const rows = query.data?.rows ?? []
    if (rows.length === 0) {
      toast.info('Nothing to export', 'No applicants match the current filters.')
      return
    }
    downloadCsv(
      `applicants-${new Date().toISOString().slice(0, 10)}`,
      rows as unknown as Record<string, unknown>[],
      [
        { key: 'reference_no', header: 'Reference' },
        { key: 'full_name', header: 'Name' },
        { key: 'email', header: 'Email' },
        { key: 'phone', header: 'Phone' },
        { key: 'position_name', header: 'Position' },
        { key: 'status', header: 'Status' },
        { key: 'age', header: 'Age' },
        { key: 'years_experience', header: 'Experience (yrs)' },
        { key: 'preferred_branch_name', header: 'Preferred branch' },
        { key: 'created_at', header: 'Submitted' },
      ],
    )
    toast.success('Export ready', `${rows.length} row(s) downloaded.`)
  }

  return (
    <>
      <PageHeader
        title="Applicants"
        description="Every application, from submission through to hire or rejection."
        actions={
          <Button
            variant="secondary"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={exportCsv}
          >
            Export CSV
          </Button>
        }
      />

      {/* Toolbar --------------------------------------------------------- */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
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
            placeholder="Search name, reference, email or phone…"
            aria-label="Search applicants"
            className="h-10 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] pl-9 text-sm text-[var(--app-text)] placeholder:text-[var(--app-text-subtle)]"
          />
        </div>

        <Button
          variant={activeFilterCount > 0 ? 'primary' : 'secondary'}
          leftIcon={<SlidersHorizontal className="h-4 w-4" />}
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
        >
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </Button>

        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            leftIcon={<X className="h-4 w-4" />}
            onClick={() => {
              setSearchParams(new URLSearchParams(), { replace: true })
              setPage(1)
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {showFilters && (
        <div className="mb-4 grid gap-4 rounded-[var(--radius-card)] border border-[var(--app-border)] bg-[var(--app-surface)] p-4 sm:grid-cols-3">
          <Field label="Status">
            <Select
              placeholder="All statuses"
              value={status}
              onChange={(e) => setFilter('status', e.target.value)}
              options={APPLICANT_STATUSES.map((s) => ({
                value: s.value,
                label: s.label,
              }))}
            />
          </Field>
          <Field label="Position">
            <Select
              placeholder="All positions"
              value={positionId}
              onChange={(e) => setFilter('position', e.target.value)}
              options={positions.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Field>
          <Field label="Preferred branch">
            <Select
              placeholder="All facilities"
              value={branchId}
              onChange={(e) => setFilter('branch', e.target.value)}
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
            />
          </Field>
        </div>
      )}

      <DataTable
        caption="Applicants"
        columns={columns}
        rows={query.data?.rows ?? []}
        rowKey={(row) => row.id}
        isLoading={query.isLoading}
        error={query.isError ? errorMessage(query.error) : null}
        onRetry={() => void qc.invalidateQueries({ queryKey: queryKeys.applicants.all })}
        emptyTitle={
          activeFilterCount > 0 || debouncedSearch
            ? 'No applicants match those filters'
            : 'No applications yet'
        }
        emptyDescription={
          activeFilterCount > 0 || debouncedSearch
            ? 'Try widening your search or clearing the filters.'
            : 'Applications submitted through the public site will appear here.'
        }
        emptyAction={
          activeFilterCount === 0 && !debouncedSearch ? (
            <Link to="/apply" target="_blank" rel="noreferrer">
              <Button variant="secondary" size="sm">
                Open the public form
              </Button>
            </Link>
          ) : undefined
        }
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
        onRowClick={(row) => navigate(`/admin/applicants/${row.id}`)}
      />
    </>
  )
}
