import { RotateCcw } from 'lucide-react'
import { formatRelative } from '@/utils/format'
import { Button } from './Button'

/**
 * Shown at the top of a staff form when `useDialogDraft` restored unsaved
 * changes into it. Renders nothing otherwise, so it can be dropped in
 * unconditionally.
 */
export function DraftNotice({
  restoredAt,
  onDiscard,
}: {
  restoredAt: string | null
  onDiscard: () => void
}) {
  if (!restoredAt) return null

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-info/30 bg-info-soft px-4 py-3 dark:bg-info/10"
    >
      <p className="text-sm text-[var(--app-text)]">
        <RotateCcw className="mr-1.5 -mt-0.5 inline h-4 w-4" aria-hidden="true" />
        Restored your unsaved changes from {formatRelative(restoredAt)}.
      </p>
      <Button variant="secondary" size="sm" onClick={onDiscard}>
        Discard changes
      </Button>
    </div>
  )
}
