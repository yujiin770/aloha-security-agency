import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'
import type { ToneName } from '@/utils/constants'

/**
 * Status pill.
 *
 * Tones carry a text label as well as colour — colour alone would fail WCAG
 * 1.4.1 for anyone who cannot distinguish red from green, which in a system
 * whose whole job is "hired vs rejected" would be a real failure, not a
 * theoretical one.
 */

/**
 * Every tone a badge can wear: the configurable `ToneName`s (stored on
 * positions in the database) plus `violet`, which is display-only and used
 * where a status needs a sixth distinct colour.
 */
export type BadgeTone = ToneName | 'violet'

const TONES: Record<BadgeTone, string> = {
  neutral:
    'bg-neutral-100 text-neutral-700 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:ring-neutral-700',
  info: 'bg-info-soft text-info ring-info/20 dark:bg-info/15 dark:text-blue-300 dark:ring-info/30',
  warning:
    'bg-warning-soft text-amber-700 ring-warning/25 dark:bg-warning/15 dark:text-amber-300 dark:ring-warning/30',
  success:
    'bg-success-soft text-success ring-success/20 dark:bg-success/15 dark:text-green-300 dark:ring-success/30',
  danger:
    'bg-danger-soft text-danger ring-danger/20 dark:bg-danger/15 dark:text-red-300 dark:ring-danger/30',
  // Pinned to red rather than `brand-*`: the admin console re-points `brand`
  // to navy, but positions offer this tone as "Red" and must stay red.
  brand:
    'bg-red-50 text-red-700 ring-red-200 dark:bg-red-900/25 dark:text-red-300 dark:ring-red-800',
  violet:
    'bg-violet-soft text-violet ring-violet/20 dark:bg-violet/15 dark:text-violet-300 dark:ring-violet/30',
  laurel:
    'bg-laurel-100 text-laurel-600 ring-laurel-500/20 dark:bg-laurel-600/15 dark:text-lime-300 dark:ring-laurel-500/30',
}

export interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
  dot?: boolean
  size?: 'sm' | 'md'
  className?: string
}

export function Badge({
  tone = 'neutral',
  children,
  dot = false,
  size = 'md',
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md font-medium ring-1 ring-inset whitespace-nowrap',
        size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs leading-5',
        TONES[tone],
        className,
      )}
    >
      {dot && (
        <span
          className="h-1.5 w-1.5 rounded-full bg-current opacity-70"
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  )
}
