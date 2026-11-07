import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/utils/cn'

export interface InactiveToggleProps {
  /** True when inactive records are currently included in the list. */
  checked: boolean
  onChange: (next: boolean) => void
  /** How many records are hidden while the toggle is off. Omit to hide the count. */
  count?: number
  /** What the hidden records are called — "inactive", "deactivated", "separated". */
  label?: string
  className?: string
}

/**
 * Lists show active records by default; this switch brings the rest back.
 * One component so every list words and behaves the same way.
 */
export function InactiveToggle({
  checked,
  onChange,
  count,
  label = 'inactive',
  className,
}: InactiveToggleProps) {
  const Icon = checked ? Eye : EyeOff
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors',
        checked
          ? 'border-brand-500/40 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
          : 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-muted)] hover:text-[var(--app-text)]',
        className,
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      Show {label}
      {count !== undefined && count > 0 && (
        <span className="rounded-full bg-[var(--app-bg)] px-1.5 text-xs tabular-nums text-[var(--app-text-subtle)]">
          {count}
        </span>
      )}
    </button>
  )
}
