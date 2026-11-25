import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Plus,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { queryKeys } from '@/lib/queryKeys'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/utils/cn'
import { listBranchOptions } from '@/features/branches/api/branchesApi'
import { downloadCsv } from '@/features/reports/api/reportsApi'
import { importPersonnelRow } from '@/features/personnel/api/personnelApi'
import {
  CIVIL_STATUS_OPTIONS,
  EMPTY_ROW,
  IMPORT_COLUMNS,
  IMPORT_SECTIONS,
  SHIFT_OPTIONS,
  STATUS_OPTIONS,
  TEMPLATE_EXAMPLES,
  columnGroup,
  columnHelp,
  columnKind,
  columnTitle,
  duplicateEmployeeNos,
  findFacility,
  normalizeValue,
  rowsFromCsv,
  rowsFromTable,
  sheetsFromXlsx,
  toImportPayload,
  validateRow,
  type ColumnKey,
  type Facility,
  type RowIssue,
  type RowValues,
  type WorkbookSheet,
} from '@/features/personnel/import/personnelCsv'
import { GUIDE_SHEET, downloadImportTemplate } from '@/features/personnel/import/templateXlsx'

type Column = (typeof IMPORT_COLUMNS)[number]

const SECTION_TITLE = new Map<string, string>(IMPORT_SECTIONS.map((s) => [s.id, s.title]))

/** Runs of neighbouring columns in the same section, for the heading band. */
function sectionBands(columns: Column[]) {
  const bands: { id: string; title: string; span: number }[] = []
  for (const c of columns) {
    const last = bands[bands.length - 1]
    if (last?.id === c.section) last.span++
    else bands.push({ id: c.section, title: SECTION_TITLE.get(c.section) ?? '', span: 1 })
  }
  return bands
}

/** True when any Personal Data Sheet column holds something. */
const hasPdsData = (values: RowValues[]) =>
  values.some((v) => IMPORT_COLUMNS.some((c) => c.group === 'pds' && v[c.key] !== ''))

type RowState = 'ready' | 'importing' | 'imported' | 'failed'

interface ImportRow {
  uid: string
  values: RowValues
  state: RowState
  serverError?: string
  personnelId?: string
}

type Filter = 'all' | 'problems' | 'imported'

const FILE_INPUT_ID = 'personnel-import-file'
const ACCEPT =
  '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const PAGE_SIZE = 25
const CONCURRENCY = 4

const newUid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`

const toImportRows = (values: RowValues[]): ImportRow[] =>
  values.map((v) => ({ uid: newUid(), values: v, state: 'ready' }))

export default function PersonnelImportPage() {
  const toast = useToast()
  const qc = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)

  const [rows, setRows] = useState<ImportRow[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [ignoredHeaders, setIgnoredHeaders] = useState<string[]>([])
  const [sheets, setSheets] = useState<WorkbookSheet[] | null>(null)
  const [sheetChoice, setSheetChoice] = useState('all')
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(1)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  // The Personal Data Sheet adds ~50 columns; they are shown when the file
  // has any of that data, and can be toggled either way.
  const [showPds, setShowPds] = useState(false)
  const columns: Column[] = showPds
    ? [...IMPORT_COLUMNS]
    : IMPORT_COLUMNS.filter((c) => c.group !== 'pds')

  const facilitiesQuery = useQuery({
    queryKey: queryKeys.branches.options(),
    queryFn: listBranchOptions,
    staleTime: 5 * 60_000,
  })
  const facilities: Facility[] = useMemo(
    () => (facilitiesQuery.data ?? []).map((b) => ({ id: b.id, name: b.name, code: b.code })),
    [facilitiesQuery.data],
  )

  /* ---------------------------------------------------------------- issues */

  const issuesByRow = useMemo(() => {
    const dupes = duplicateEmployeeNos(rows)
    const map = new Map<string, RowIssue[]>()
    for (const r of rows) {
      if (r.state === 'imported') continue
      map.set(r.uid, validateRow(r.values, { facilities, duplicateEmployeeNos: dupes }))
    }
    return map
  }, [rows, facilities])

  const hasError = (r: ImportRow) =>
    (issuesByRow.get(r.uid) ?? []).some((i) => i.level === 'error') || r.state === 'failed'

  const counts = useMemo(() => {
    let ready = 0
    let problems = 0
    let imported = 0
    for (const r of rows) {
      if (r.state === 'imported') imported++
      else if ((issuesByRow.get(r.uid) ?? []).some((i) => i.level === 'error')) problems++
      else ready++
    }
    return { ready, problems, imported }
  }, [rows, issuesByRow])

  const visible = rows.filter((r) =>
    filter === 'all' ? true : filter === 'imported' ? r.state === 'imported' : hasError(r),
  )
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageRows = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // Leaving with rows not yet imported would throw away the edits.
  const pending = rows.some((r) => r.state !== 'imported')
  useEffect(() => {
    if (!pending) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [pending])

  /* ------------------------------------------------------------- loading */

  function loadSheets(all: WorkbookSheet[], choice: string) {
    // The template's Guide sheet explains the columns; it holds no guards.
    const chosen =
      choice === 'all' ? all.filter((s) => s.name !== GUIDE_SHEET) : all.filter((s) => s.name === choice)
    const parsed = chosen.map((s) => {
      try {
        return rowsFromTable(s.table)
      } catch {
        return { rows: [], ignoredHeaders: [] }
      }
    })
    const values = parsed.flatMap((p) => p.rows)
    if (values.length === 0) throw new Error('No personnel rows were found in this file.')
    setRows(toImportRows(values))
    setShowPds(hasPdsData(values))
    setIgnoredHeaders([...new Set(parsed.flatMap((p) => p.ignoredHeaders))])
    setPage(1)
    setFilter('all')
  }

  async function onFile(file: File) {
    try {
      const name = file.name.toLowerCase()
      if (name.endsWith('.xlsx')) {
        const { unzipSync } = await import('fflate')
        const all = sheetsFromXlsx(unzipSync(new Uint8Array(await file.arrayBuffer())))
        setSheets(all)
        setSheetChoice('all')
        loadSheets(all, 'all')
      } else if (name.endsWith('.csv') || file.type === 'text/csv') {
        const parsed = rowsFromCsv(await file.text())
        if (parsed.rows.length === 0) throw new Error('No personnel rows were found in this file.')
        setSheets(null)
        setRows(toImportRows(parsed.rows))
        setShowPds(hasPdsData(parsed.rows))
        setIgnoredHeaders(parsed.ignoredHeaders)
        setPage(1)
        setFilter('all')
      } else {
        throw new Error('Upload a .csv or .xlsx file. Older .xls files: save as .xlsx first.')
      }
      setFileName(file.name)
    } catch (error) {
      toast.error('Could not read the file', errorMessage(error))
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function downloadTemplate() {
    downloadImportTemplate().catch((error) =>
      toast.error('Could not create the template', errorMessage(error)),
    )
  }

  /** For anyone working outside Excel. The .xlsx keeps long numbers safer. */
  function downloadCsvTemplate() {
    downloadCsv(
      'personnel-import-template',
      TEMPLATE_EXAMPLES.map((r) => ({ ...EMPTY_ROW, ...r })),
      IMPORT_COLUMNS.map((c) => ({ key: c.key, header: c.header })),
    )
  }

  /* ------------------------------------------------------------- editing */

  function setCell(uid: string, key: ColumnKey, value: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.uid === uid
          ? {
              ...r,
              values: { ...r.values, [key]: value },
              state: r.state === 'failed' ? 'ready' : r.state,
              serverError: undefined,
            }
          : r,
      ),
    )
  }

  function normalizeCell(uid: string, key: ColumnKey) {
    setRows((prev) =>
      prev.map((r) =>
        r.uid === uid ? { ...r, values: { ...r.values, [key]: normalizeValue(key, r.values[key]) } } : r,
      ),
    )
  }

  function removeRow(uid: string) {
    setRows((prev) => prev.filter((r) => r.uid !== uid))
  }

  function addRow() {
    setRows((prev) => [...prev, { uid: newUid(), values: { ...EMPTY_ROW }, state: 'ready' }])
    setFilter('all')
    setPage(Math.ceil((rows.length + 1) / PAGE_SIZE))
  }

  function clearAll() {
    if (pending && !window.confirm('Discard all rows that have not been imported?')) return
    setRows([])
    setFileName(null)
    setSheets(null)
    setIgnoredHeaders([])
  }

  /* -------------------------------------------------------------- import */

  async function runImport() {
    const queue = rows.filter(
      (r) => r.state !== 'imported' && !(issuesByRow.get(r.uid) ?? []).some((i) => i.level === 'error'),
    )
    if (queue.length === 0) return

    setImporting(true)
    setProgress({ done: 0, total: queue.length })
    const update = (uid: string, patch: Partial<ImportRow>) =>
      setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)))

    let next = 0
    let ok = 0
    let failed = 0
    const worker = async () => {
      while (next < queue.length) {
        const row = queue[next++]!
        update(row.uid, { state: 'importing', serverError: undefined })
        try {
          const person = await importPersonnelRow(toImportPayload(row.values, facilities))
          update(row.uid, { state: 'imported', personnelId: person.id })
          ok++
        } catch (error) {
          update(row.uid, { state: 'failed', serverError: errorMessage(error) })
          failed++
        }
        setProgress((p) => ({ ...p, done: p.done + 1 }))
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))

    setImporting(false)
    void qc.invalidateQueries({ queryKey: queryKeys.personnel.all })
    void qc.invalidateQueries({ queryKey: queryKeys.deployments.all })
    void qc.invalidateQueries({ queryKey: queryKeys.branches.all })
    void qc.invalidateQueries({ queryKey: queryKeys.reports.all })

    if (failed === 0) toast.success('Import finished', `${ok} personnel added to the roster.`)
    else {
      toast.warning('Import finished with problems', `${ok} added, ${failed} could not be saved — see the rows marked in red.`)
      setFilter('problems')
      setPage(1)
    }
  }

  /* -------------------------------------------------------------- render */

  return (
    <div
      onDragOver={(e) => {
        if (rows.length > 0 && !importing && e.dataTransfer.types.includes('Files')) e.preventDefault()
      }}
      onDrop={(e) => {
        if (rows.length === 0 || importing) return
        e.preventDefault()
        const file = e.dataTransfer.files[0]
        if (file && (!pending || window.confirm('Replace the rows on this page with the dropped file?'))) {
          void onFile(file)
        }
      }}
    >
      <PageHeader
        breadcrumbs={[
          { label: 'Personnel', to: '/admin/personnel' },
          { label: 'Import' },
        ]}
        title="Import personnel"
        description="Add existing guards in bulk: download the template, fill it in, upload it, check and fix the rows here, then import."
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<Download className="h-4 w-4" />}
              onClick={downloadTemplate}
            >
              Download template
            </Button>
            {rows.length > 0 && (
              <Button
                leftIcon={<Upload className="h-4 w-4" />}
                onClick={() => fileInput.current?.click()}
                disabled={importing}
              >
                Upload another file
              </Button>
            )}
          </>
        }
      />

      {/* One input for the drop zone and the header button. It lives in the
          page body so nothing can unmount it while the file picker is open. */}
      <input
        id={FILE_INPUT_ID}
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onFile(file)
        }}
      />

      {rows.length === 0 ? (
        <Guide
          onTemplate={downloadTemplate}
          onCsvTemplate={downloadCsvTemplate}
          onFile={(f) => void onFile(f)}
        />
      ) : (
        <>
          <Card className="mb-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <div className="flex min-w-0 items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-[var(--app-text-subtle)]" aria-hidden="true" />
                <span className="truncate text-sm font-medium text-[var(--app-text)]">{fileName ?? 'New rows'}</span>
              </div>

              {sheets && sheets.length > 1 && (
                <label className="flex items-center gap-2 text-sm text-[var(--app-text-muted)]">
                  Sheet
                  <select
                    className="h-8 rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-sm text-[var(--app-text)]"
                    value={sheetChoice}
                    disabled={importing}
                    onChange={(e) => {
                      if (
                        rows.some((r) => r.state === 'imported') ||
                        window.confirm('Reload rows from this sheet? Edits made here will be lost.')
                      ) {
                        setSheetChoice(e.target.value)
                        try {
                          loadSheets(sheets, e.target.value)
                        } catch (error) {
                          toast.error('Could not read that sheet', errorMessage(error))
                        }
                      }
                    }}
                  >
                    <option value="all">All sheets ({sheets.length})</option>
                    {sheets.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <FilterChip active={filter === 'all'} onClick={() => { setFilter('all'); setPage(1) }}>
                  All {rows.length}
                </FilterChip>
                <FilterChip
                  active={filter === 'problems'}
                  tone="danger"
                  onClick={() => { setFilter('problems'); setPage(1) }}
                >
                  Needs fixing {counts.problems + rows.filter((r) => r.state === 'failed').length}
                </FilterChip>
                <FilterChip
                  active={filter === 'imported'}
                  tone="success"
                  onClick={() => { setFilter('imported'); setPage(1) }}
                >
                  Imported {counts.imported}
                </FilterChip>
              </div>

              <label className="flex items-center gap-2 text-sm text-[var(--app-text-muted)]">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--color-brand-500)]"
                  checked={showPds}
                  onChange={(e) => setShowPds(e.target.checked)}
                />
                Personal Data Sheet columns
              </label>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" onClick={clearAll} disabled={importing}>
                  Clear
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Plus className="h-4 w-4" />}
                  onClick={addRow}
                  disabled={importing}
                >
                  Add row
                </Button>
                <Button
                  size="sm"
                  onClick={() => void runImport()}
                  isLoading={importing}
                  disabled={counts.ready === 0}
                >
                  Import {counts.ready} ready row{counts.ready === 1 ? '' : 's'}
                </Button>
              </div>
            </div>

            {importing && (
              <div className="mt-3" role="status">
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--app-border)]">
                  <div
                    className="h-full bg-brand-500 transition-[width]"
                    style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                  Importing {progress.done} of {progress.total}…
                </p>
              </div>
            )}

            {ignoredHeaders.length > 0 && (
              <p className="mt-3 text-xs text-[var(--app-text-muted)]">
                Columns not imported: {ignoredHeaders.join(', ')}.
              </p>
            )}
            {counts.problems > 0 && !importing && (
              <p className="mt-2 text-xs text-[var(--app-text-muted)]">
                Rows that need fixing are skipped by Import. Fix the cells outlined in red, or delete the row.
              </p>
            )}
            {counts.imported > 0 && !importing && (
              <p className="mt-2 text-xs text-[var(--app-text-muted)]">
                <Link to="/admin/personnel" className="font-medium text-brand-600 hover:underline">
                  View the roster
                </Link>{' '}
                to see the imported personnel.
              </p>
            )}
          </Card>

          <Card padded={false}>
            <div className="overflow-x-auto">
              <table className="min-w-max border-collapse text-xs">
                <thead className="bg-[var(--app-bg)] text-left text-[11px] font-semibold tracking-wide text-[var(--app-text-subtle)] uppercase">
                  {/* The Personal Data Sheet's sections, as on the personnel page. */}
                  <tr className="border-b border-[var(--app-border)]">
                    <th className="sticky left-0 z-10 bg-[var(--app-bg)]" />
                    <th />
                    {sectionBands(columns).map((b) => (
                      <th
                        key={b.id}
                        colSpan={b.span}
                        scope="colgroup"
                        className="border-l border-[var(--app-border)] px-2 pt-2 pb-1.5 whitespace-nowrap text-[var(--app-text)] normal-case"
                      >
                        {b.title}
                      </th>
                    ))}
                    <th />
                  </tr>
                  <tr>
                    <th className="sticky left-0 z-10 bg-[var(--app-bg)] px-2 py-2">#</th>
                    <th className="px-2 py-2" style={{ minWidth: 260 }}>Check</th>
                    {columns.map((c, i) => (
                      <th
                        key={c.key}
                        className={cn(
                          'px-2 py-2 whitespace-nowrap',
                          c.group === 'pds' && 'bg-success/5',
                          i > 0 && columns[i - 1]!.section !== c.section && 'border-l border-[var(--app-border)]',
                        )}
                        style={{ minWidth: c.width }}
                        title={c.header}
                      >
                        {c.label}
                        {'required' in c && c.required && <span className="text-danger"> *</span>}
                      </th>
                    ))}
                    <th className="px-2 py-2" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--app-border)]">
                  {pageRows.length === 0 && (
                    <tr>
                      <td colSpan={columns.length + 3} className="px-4 py-8 text-center text-sm text-[var(--app-text-muted)]">
                        No rows in this view.
                      </td>
                    </tr>
                  )}
                  {pageRows.map((row) => (
                    <RowEditor
                      key={row.uid}
                      index={rows.indexOf(row) + 1}
                      row={row}
                      columns={columns}
                      issues={issuesByRow.get(row.uid) ?? []}
                      facilities={facilities}
                      disabled={importing}
                      onChange={setCell}
                      onBlur={normalizeCell}
                      onRemove={removeRow}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {pageCount > 1 && (
              <div className="flex items-center justify-between border-t border-[var(--app-border)] px-4 py-3 text-sm">
                <span className="text-[var(--app-text-muted)]">
                  Page {currentPage} of {pageCount} · {visible.length} row(s)
                </span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                    Previous
                  </Button>
                  <Button variant="secondary" size="sm" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function FilterChip({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean
  tone?: 'danger' | 'success'
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? tone === 'danger'
            ? 'border-danger bg-danger/10 text-danger'
            : tone === 'success'
              ? 'border-success bg-success/10 text-success'
              : 'border-brand-500 bg-brand-500/10 text-brand-600'
          : 'border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text)]',
      )}
    >
      {children}
    </button>
  )
}

const CELL =
  'h-8 w-full rounded-md border bg-[var(--app-surface)] px-2 text-xs text-[var(--app-text)] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none disabled:opacity-60'

function RowEditor({
  index,
  row,
  columns,
  issues,
  facilities,
  disabled,
  onChange,
  onBlur,
  onRemove,
}: {
  index: number
  row: ImportRow
  columns: Column[]
  issues: RowIssue[]
  facilities: Facility[]
  disabled: boolean
  onChange: (uid: string, key: ColumnKey, value: string) => void
  onBlur: (uid: string, key: ColumnKey) => void
  onRemove: (uid: string) => void
}) {
  const imported = row.state === 'imported'
  const errors = issues.filter((i) => i.level === 'error')
  const warnings = issues.filter((i) => i.level === 'warning')
  const levelFor = (key: ColumnKey) =>
    issues.find((i) => i.column === key && i.level === 'error')
      ? 'error'
      : issues.find((i) => i.column === key)
        ? 'warning'
        : null

  return (
    <tr
      className={cn(
        'align-top',
        imported && 'bg-success/5',
        (errors.length > 0 || row.state === 'failed') && 'bg-danger/[0.03]',
      )}
    >
      <td className="sticky left-0 z-10 bg-[var(--app-surface)] px-2 py-2 text-[var(--app-text-subtle)]">{index}</td>
      <td className="px-2 py-2" style={{ minWidth: 260, maxWidth: 320 }}>
        {imported ? (
          <span className="inline-flex items-center gap-1 font-medium text-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Imported
            {row.personnelId && (
              <Link to={`/admin/personnel/${row.personnelId}`} className="ml-1 text-brand-600 hover:underline">
                Open
              </Link>
            )}
          </span>
        ) : row.state === 'importing' ? (
          <span className="text-[var(--app-text-muted)]">Importing…</span>
        ) : (
          <ul className="space-y-1">
            {row.serverError && (
              <li className="flex gap-1 text-danger">
                <XCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {row.serverError}
              </li>
            )}
            {errors.map((i, n) => (
              <li key={`e${n}`} className="flex gap-1 text-danger">
                <XCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {i.message}
              </li>
            ))}
            {warnings.map((i, n) => (
              <li key={`w${n}`} className="flex gap-1 text-warning">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {i.message}
              </li>
            ))}
            {!row.serverError && issues.length === 0 && (
              <li>
                <Badge tone="success" size="sm">
                  Ready
                </Badge>
              </li>
            )}
          </ul>
        )}
      </td>

      {columns.map((c, i) => {
        const value = row.values[c.key]
        const level = levelFor(c.key)
        const cls = cn(
          CELL,
          level === 'error'
            ? 'border-danger bg-danger/5'
            : level === 'warning'
              ? 'border-warning'
              : 'border-[var(--app-border)]',
        )
        const common = {
          'aria-label': `${columnTitle(c)}, row ${index}`,
          disabled: disabled || imported,
          className: cls,
          title:
            issues.filter((i) => i.column === c.key).map((i) => i.message).join('\n') ||
            columnHelp(c.key),
        }

        let options: { value: string; label: string }[] | null = null
        switch (columnKind(c.key)) {
          case 'status':
            options = STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))
            break
          case 'shift':
            options = SHIFT_OPTIONS.map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) }))
            break
          case 'sex':
            options = [
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
            ]
            break
          case 'facility':
            options = facilities.map((f) => ({ value: f.name, label: f.name }))
            break
          case 'yesno':
            options = [
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
            ]
            break
          case 'civil':
            options = CIVIL_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))
            break
        }

        return (
          <td
            key={c.key}
            className={cn(
              'px-1.5 py-1.5',
              columnGroup(c.key) === 'pds' && 'bg-success/[0.02]',
              i > 0 && columns[i - 1]!.section !== c.section && 'border-l border-[var(--app-border)]',
            )}
            style={{ minWidth: c.width }}
          >
            {options ? (
              <select
                {...common}
                value={
                  c.key === 'facility' ? (findFacility(value, facilities)?.name ?? value) : value
                }
                onChange={(e) => onChange(row.uid, c.key, e.target.value)}
              >
                <option value="">
                  {c.key === 'status' ? 'Active' : c.key === 'facility' ? 'Not assigned' : c.key === 'shift' ? 'Day' : '—'}
                </option>
                {/* Keep an unrecognised value visible so it can be seen and replaced. */}
                {value &&
                  !options.some(
                    (o) => o.value === (c.key === 'facility' ? findFacility(value, facilities)?.name : value),
                  ) && <option value={value}>{value} (not valid)</option>}
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                {...common}
                value={value}
                placeholder={
                  columnKind(c.key) === 'date'
                    ? 'YYYY-MM-DD'
                    : columnKind(c.key) === 'list'
                      ? 'a; b; c | next entry'
                      : undefined
                }
                onChange={(e) => onChange(row.uid, c.key, e.target.value)}
                onBlur={() => onBlur(row.uid, c.key)}
              />
            )}
          </td>
        )
      })}

      <td className="px-2 py-1.5">
        {!imported && (
          <button
            type="button"
            onClick={() => onRemove(row.uid)}
            disabled={disabled}
            className="rounded-md p-1.5 text-[var(--app-text-subtle)] hover:bg-danger/10 hover:text-danger disabled:opacity-50"
            aria-label={`Delete row ${index}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  )
}

/**
 * Drop a file here or click to browse. A <label> for the page's file input, so
 * clicking opens the picker natively, with drag-and-drop on top.
 */
function DropZone({ onFile }: { onFile: (file: File) => void }) {
  const [over, setOver] = useState(false)
  return (
    <label
      htmlFor={FILE_INPUT_ID}
      onDragEnter={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const file = e.dataTransfer.files[0]
        if (file) onFile(file)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          document.getElementById(FILE_INPUT_ID)?.click()
        }
      }}
      tabIndex={0}
      role="button"
      aria-label="Upload a .csv or .xlsx file"
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none',
        over
          ? 'border-brand-500 bg-brand-500/5'
          : 'border-[var(--app-border)] hover:border-brand-500/60 hover:bg-[var(--app-bg)]',
      )}
    >
      <Upload className={cn('h-8 w-8', over ? 'text-brand-500' : 'text-[var(--app-text-subtle)]')} aria-hidden="true" />
      <span className="text-sm font-medium text-[var(--app-text)]">
        {over ? 'Drop the file to upload it' : 'Drag and drop your file here'}
      </span>
      <span className="text-xs text-[var(--app-text-muted)]">
        or <span className="font-medium text-brand-600 underline">click to browse</span> · .xlsx or .csv
      </span>
    </label>
  )
}

function Guide({
  onTemplate,
  onCsvTemplate,
  onFile,
}: {
  onTemplate: () => void
  onCsvTemplate: () => void
  onFile: (file: File) => void
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <DropZone onFile={onFile} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-[var(--app-text-muted)]">
            Don’t have a file yet? Start from the Excel template.{' '}
            <button type="button" className="font-medium text-brand-600 hover:underline" onClick={onCsvTemplate}>
              CSV version
            </button>
          </span>
          <Button variant="secondary" size="sm" leftIcon={<Download className="h-4 w-4" />} onClick={onTemplate}>
            Download template (.xlsx)
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-[var(--app-text)]">Filling in the template</h2>
        <ul className="mt-3 space-y-2 text-sm text-[var(--app-text-muted)]">
          <li><strong className="text-[var(--app-text)]">Order:</strong> the same sections, order and labels as the Personal Data Sheet on a personnel record, with the section named above each group of columns. Posting and status (facility, status…) come last.</li>
          <li><strong className="text-[var(--app-text)]">Required:</strong> First name and Last name only — leave anything you don’t have blank.</li>
          <li><strong className="text-[var(--app-text)]">Lists</strong> (dependents, employment, trainings, references): one entry per line (Alt+Enter), parts separated by “;”.</li>
          <li><strong className="text-[var(--app-text)]">Dates:</strong> YYYY-MM-DD is safest; 04/30/2024 and 30 April 2024 are read too.</li>
          <li><strong className="text-[var(--app-text)]">Yes/No questions:</strong> Yes or No (Y / N, Oo / Wala work too).</li>
          <li><strong className="text-[var(--app-text)]">Facility:</strong> the name or code, exactly as on the Area page.</li>
          <li><strong className="text-[var(--app-text)]">Status:</strong> Suspended, Terminated and Blocklisted need a Status Reason.</li>
          <li>The <strong className="text-[var(--app-text)]">Guide</strong> sheet in the template explains every column.</li>
        </ul>
      </Card>

      <Card className="lg:col-span-3">
        <h2 className="text-base font-semibold text-[var(--app-text)]">How it works</h2>
        <ol className="mt-3 list-inside list-decimal space-y-2 text-sm text-[var(--app-text-muted)]">
          <li>
            <strong className="text-[var(--app-text)]">Download the template</strong> and fill one row per
            guard — the whole Personal Data Sheet fits on that row. Delete the two example rows.
          </li>
          <li>
            <strong className="text-[var(--app-text)]">Upload</strong> it as .csv, or upload the Excel
            workbook (.xlsx) directly — the client roster sheets are recognised too (NAME, DATE STARTED,
            AREA OF ASSIGNMENT, …).
          </li>
          <li>
            <strong className="text-[var(--app-text)]">Check and edit</strong> the rows here. Problems are
            outlined in red; rows with problems are skipped until fixed.
          </li>
          <li>
            <strong className="text-[var(--app-text)]">Import.</strong> Each row is saved on its own, so a
            row that fails stays here to fix and retry.
          </li>
        </ol>
      </Card>
    </div>
  )
}
