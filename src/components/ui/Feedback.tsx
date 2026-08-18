import type { ReactNode } from 'react'
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Button } from './Button'
import { motion } from 'framer-motion'
import { Logo } from '@/components/Logo'

/** Loading, empty and error states — the three screens every list needs. */

// Add this component to the file:
export function SplashScreen() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white dark:bg-ink">
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
          {/* Moving Progress Bar */}
          <motion.div
            className="absolute inset-y-0 left-0 bg-brand-500"
            initial={{ width: "0%", x: "-100%" }}
            animate={{ 
              width: ["20%", "40%", "20%"],
              x: ["-100%", "400%", "400%"] 
            }}
            transition={{ 
              duration: 2, 
              repeat: Infinity, 
              ease: "easeInOut" 
            }}
          />
        </div>

        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-xs font-medium tracking-[0.2em] text-neutral-400 uppercase"
        >Loading....
        </motion.p>
      </div>
    </div>
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
      <div className="rounded-full bg-[var(--app-bg)] p-3 text-[var(--app-text-subtle)]">
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
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
