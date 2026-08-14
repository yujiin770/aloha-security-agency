import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'

export interface Crumb {
  label: string
  to?: string
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  breadcrumbs?: Crumb[]
  className?: string
}) {
  return (
    <div className={cn('mb-6', className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-[var(--app-text-muted)]">
            {breadcrumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {index > 0 && (
                  <ChevronRight className="h-3 w-3 opacity-50" aria-hidden="true" />
                )}
                {crumb.to ? (
                  <Link to={crumb.to} className="hover:text-[var(--app-text)]">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-[var(--app-text)]">
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--app-text)] sm:text-2xl">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-[var(--app-text-muted)]">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  )
}
