import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Inbox, Loader2, RotateCw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Button } from './Button'
import { motion } from 'framer-motion'
import { Logo } from '@/components/Logo'

/** Loading, empty and error states — the three screens every list needs. */

export function SplashScreen() {
  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white dark:bg-ink"
    >
      <div className="relative flex flex-col items-center gap-8">
        {/* Logo Animation */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Logo size="lg" />
        </motion.div>

        {/* Loading Bar Container */}
        <div className="relative h-1 w-48 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          {/* 3-Second Progress Bar */}
          <motion.div
            className="absolute inset-y-0 left-0 bg-brand-500"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ 
              duration: 2, 
              ease: "easeInOut" 
            }}
          />
        </div>

        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-xs font-medium tracking-[0.2em] text-neutral-400 uppercase"
        >
          Loading......
        </motion.p>
      </div>
    </motion.div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded bg-[var(--app-border)]/60',
        className ?? 'h-4 w-full',
      )}
      aria-hidden="true"
    />
  )
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading data">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className={cn('h-9 flex-1', c === 0 && 'max-w-[220px]')}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-16 text-[var(--app-text-muted)]"
      role="status"
    >
      <Loader2 className="h-6 w-6 animate-spin text-brand-500" aria-hidden="true" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export interface EmptyStateProps {
  title: string
  description?: ReactNode
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-16 text-center',
        className,
      )}
    >
      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-3 text-[var(--app-text-subtle)]">
        {icon ?? <Inbox className="h-6 w-6" aria-hidden="true" />}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-[var(--app-text)]">{title}</h3>
        {description && (
          <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--app-text-muted)]">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}

export interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-16 text-center',
        className,
      )}
    >
      <div className="rounded-full bg-danger-soft p-3 text-danger">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-[var(--app-text)]">{title}</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-[var(--app-text-muted)]">
          {message}
        </p>
      </div>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          leftIcon={<RotateCw className="h-3.5 w-3.5" aria-hidden="true" />}
        >
          Try again
        </Button>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* KPI tile                                                                    */
/* -------------------------------------------------------------------------- */

export type StatTone = 'primary' | 'info' | 'warning' | 'success' | 'danger' | 'violet' | 'neutral'

const STAT_ICON_TONES: Record<StatTone, string> = {
  primary: 'bg-brand-50 text-brand-600 dark:text-brand-300',
  info: 'bg-info-soft text-info dark:bg-info/15 dark:text-blue-300',
  warning: 'bg-warning-soft text-warning dark:bg-warning/15 dark:text-amber-300',
  success: 'bg-success-soft text-success dark:bg-success/15 dark:text-green-300',
  danger: 'bg-danger-soft text-danger dark:bg-danger/15 dark:text-red-300',
  violet: 'bg-violet-soft text-violet dark:bg-violet/15 dark:text-violet-300',
  neutral: 'bg-[var(--app-bg)] text-[var(--app-text-muted)]',
}

export interface StatCardProps {
  label: string
  value: ReactNode
  icon: LucideIcon
  tone?: StatTone
  /** One line of context under the number — never an invented trend. */
  caption?: ReactNode
  /** Makes the whole tile a link (e.g. to the filtered list). */
  to?: string
  isLoading?: boolean
  className?: string
}

/**
 * A summary number with its label and icon.
 *
 * The icon is decoration — the label carries the meaning — and the value is
 * tabular so a row of tiles lines up as the numbers change.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'primary',
  caption,
  to,
  isLoading,
  className,
}: StatCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-[var(--app-text-muted)]">{label}</p>
        <span className={cn('shrink-0 rounded-lg p-2', STAT_ICON_TONES[tone])}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      {isLoading ? (
        <Skeleton className="mt-2 h-8 w-20" />
      ) : (
        <p className="mt-1 text-[28px] leading-9 font-semibold tracking-tight text-[var(--app-text)] tabular-nums">
          {value}
        </p>
      )}
      {caption && (
        <p className="mt-1 truncate text-xs text-[var(--app-text-subtle)]">{caption}</p>
      )}
    </>
  )

  const classes = cn(
    'block rounded-[var(--radius-card)] border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-[var(--shadow-card)]',
    to &&
      'transition-[border-color,box-shadow] duration-150 hover:border-brand-300 hover:shadow-[var(--shadow-raised)]',
    className,
  )

  return to ? (
    <Link to={to} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  )
}
