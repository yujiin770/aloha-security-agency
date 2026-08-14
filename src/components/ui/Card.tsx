import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

export interface CardProps {
  children: ReactNode
  className?: string
  padded?: boolean
  as?: 'div' | 'section' | 'article'
}

export function Card({ children, className, padded = true, as: Tag = 'div' }: CardProps) {
  return (
    <Tag
      className={cn(
        'rounded-[var(--radius-card)] border border-[var(--app-border)]',
        'bg-[var(--app-surface)] shadow-[var(--shadow-card)]',
        padded && 'p-5',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

export interface CardHeaderProps {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  icon?: ReactNode
  className?: string
}

export function CardHeader({
  title,
  description,
  actions,
  icon,
  className,
}: CardHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-[var(--app-border)] px-5 py-4',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-0.5 text-brand-500">{icon}</div>}
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-[var(--app-text)]">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-sm text-[var(--app-text-muted)]">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function CardBody({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn('p-5', className)}>{children}</div>
}

export function CardFooter({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-end gap-2 border-t border-[var(--app-border)] px-5 py-3',
        className,
      )}
    >
      {children}
    </div>
  )
}
