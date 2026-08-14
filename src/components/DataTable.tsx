import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback'
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '@/utils/constants'

/**
 * The shared admin table.
 *
 * Server-driven: sorting and pagination are handed back to the caller, which
 * turns them into Supabase `.order()` / `.range()` calls. Nothing is sorted or
 * sliced in the browser, because these tables page over thousands of rows and
 * RLS means the client never has the full set anyway.
 */

export interface Column<T> {
  key: string
  header: ReactNode
  /** Column id to sort by on the server. Omit to make the column unsortable. */
  sortKey?: string
  render: (row: T) => ReactNode
  className?: string
  headerClassName?: string
  /** Hidden below `lg`, for secondary detail. */
  secondary?: boolean
}

export interface SortState {
  column: string
  direction: 'asc' | 'desc'
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  isLoading?: boolean
  error?: string | null
  onRetry?: () => void

  emptyTitle?: string
  emptyDescription?: ReactNode
  emptyAction?: ReactNode

  sort?: SortState
  onSortChange?: (sort: SortState) => void

  page?: number
  pageSize?: number
  totalCount?: number
  onPageChange?: (page: number) => void
  onPageSizeChange?: (size: number) => void

  onRowClick?: (row: T) => void
  /** Rendered above each row group — used for bulk-action bars. */
  toolbar?: ReactNode
  caption?: string
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading,
  error,
  onRetry,
  emptyTitle = 'No records found',
  emptyDescription,
  emptyAction,
  sort,
  onSortChange,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  totalCount = 0,
  onPageChange,
  onPageSizeChange,
  onRowClick,
  toolbar,
  caption,
}: DataTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalCount)

  function handleSort(column: Column<T>) {
    if (!column.sortKey || !onSortChange) return
    const isCurrent = sort?.column === column.sortKey
    onSortChange({
      column: column.sortKey,
      direction: isCurrent && sort?.direction === 'asc' ? 'desc' : 'asc',
    })
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--app-border)] bg-[var(--app-surface)]">
      {toolbar}

      {error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : isLoading ? (
        <TableSkeleton cols={columns.length} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      ) : (
        <div className="scrollbar-slim max-h-[calc(100dvh-20rem)] overflow-auto">
          <table className="table-sticky w-full border-collapse text-sm">
            {caption && <caption className="sr-only">{caption}</caption>}
            <thead>
              <tr>
                {columns.map((column) => {
                  const isSorted = sort?.column === column.sortKey
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={
                        isSorted
                          ? sort?.direction === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : column.sortKey
                            ? 'none'
                            : undefined
                      }
                      className={cn(
                        'px-4 py-3 text-left text-xs font-semibold tracking-wide text-[var(--app-text-muted)] uppercase',
                        column.secondary && 'hidden lg:table-cell',
                        column.headerClassName,
                      )}
                    >
                      {column.sortKey ? (
                        <button
                          type="button"
                          onClick={() => handleSort(column)}
                          className="inline-flex items-center gap-1 rounded hover:text-[var(--app-text)]"
                        >
                          {column.header}
                          {isSorted ? (
                            sort?.direction === 'asc' ? (
                              <ArrowUp className="h-3 w-3" aria-hidden="true" />
                            ) : (
                              <ArrowDown className="h-3 w-3" aria-hidden="true" />
                            )
                          ) : (
                            <ArrowUpDown
                              className="h-3 w-3 opacity-40"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  // Rows are only keyboard-interactive when they actually do
                  // something; a decorative tabindex would just add noise.
                  tabIndex={onRowClick ? 0 : undefined}
                  role={onRowClick ? 'button' : undefined}
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            onRowClick(row)
                          }
                        }
                      : undefined
                  }
                  className={cn(
                    'border-t border-[var(--app-border)] transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-[var(--app-bg)]',
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        'px-4 py-3 align-middle text-[var(--app-text)]',
                        column.secondary && 'hidden lg:table-cell',
                        column.className,
                      )}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {onPageChange && totalCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] px-4 py-3">
          <p className="text-xs text-[var(--app-text-muted)]">
            Showing <strong className="font-semibold">{from}</strong>–
            <strong className="font-semibold">{to}</strong> of{' '}
            <strong className="font-semibold">{totalCount}</strong>
          </p>

          <div className="flex items-center gap-3">
            {onPageSizeChange && (
              <label className="flex items-center gap-1.5 text-xs text-[var(--app-text-muted)]">
                Rows
                <select
                  value={pageSize}
                  onChange={(e) => onPageSizeChange(Number(e.target.value))}
                  className="h-8 rounded border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-xs"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <nav className="flex items-center gap-1" aria-label="Pagination">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <span className="px-2 text-xs text-[var(--app-text-muted)]">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </nav>
          </div>
        </div>
      )}
    </div>
  )
}
