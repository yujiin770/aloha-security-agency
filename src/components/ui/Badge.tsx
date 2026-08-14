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

const TONES: Record<ToneName, string> = {
  neutral:
    'bg-neutral-100 text-neutral-700 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:ring-neutral-700',
  info: 'bg-info-soft text-info ring-info/20 dark:bg-info/15 dark:text-blue-300 dark:ring-info/30',
  warning:
    'bg-warning-soft text-amber-700 ring-warning/25 dark:bg-warning/15 dark:text-amber-300 dark:ring-warning/30',
  success:
    'bg-success-soft text-success ring-success/20 dark:bg-success/15 dark:text-green-300 dark:ring-success/30',
  danger:
    'bg-danger-soft text-danger ring-danger/20 dark:bg-danger/15 dark:text-red-300 dark:ring-danger/30',
  brand:
    'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-900/25 dark:text-brand-300 dark:ring-brand-800',
  laurel:
    'bg-laurel-100 text-laurel-600 ring-laurel-500/20 dark:bg-laurel-600/15 dark:text-lime-300 dark:ring-laurel-500/30',
}

export interface BadgeProps {
  tone?: ToneName
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
        'inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
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
