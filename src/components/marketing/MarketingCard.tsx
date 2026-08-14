import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/utils/cn'

/**
 * Marketing card: rounded XL, soft shadow, hover lift.
 *
 * Distinct from `components/ui/Card`, which is deliberately flat for dense
 * admin tables. Trying to serve both from one component produced a card that
 * was slightly wrong in both places.
 *
 * Renders as a `<Link>` when `to` is given, so the whole card is one hit target
 * rather than a div containing a small link.
 */

export interface MarketingCardProps {
  children: ReactNode
  className?: string
  /** Makes the entire card a link. */
  to?: string
  /** Dark cards for use on dark sections. */
  inverted?: boolean
  /** Disable the hover lift for static, non-interactive cards. */
  interactive?: boolean
  padding?: 'md' | 'lg'
}

export function MarketingCard({
  children,
  className,
  to,
  inverted = false,
  interactive = true,
  padding = 'lg',
}: MarketingCardProps) {
  const classes = cn(
    'group relative flex h-full flex-col rounded-[var(--radius-xl)] border',
    padding === 'lg' ? 'p-7 sm:p-8' : 'p-6',
    inverted
      ? 'border-white/10 bg-white/[0.04] text-white'
      : 'border-[var(--app-border)] bg-white shadow-[var(--shadow-soft)]',
    interactive && 'hover-lift',
    interactive && !inverted && 'hover:border-brand-200',
    interactive && inverted && 'hover:border-white/25 hover:bg-white/[0.07]',
    className,
  )

  if (to) {
    return (
      <Link to={to} className={classes}>
        {children}
      </Link>
    )
  }

  return <div className={classes}>{children}</div>
}

/**
 * Icon tile used at the top of most marketing cards.
 *
 * Inverts to solid red on card hover, which is what gives the grid its sense of
 * response without animating anything expensive.
 */
export function CardIcon({
  children,
  inverted = false,
  className,
}: {
  children: ReactNode
  inverted?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] transition-colors duration-300',
        inverted
          ? 'bg-white/10 text-brand-400 group-hover:bg-brand-500 group-hover:text-white'
          : 'bg-brand-50 text-brand-600 group-hover:bg-brand-500 group-hover:text-white',
        className,
      )}
      aria-hidden="true"
    >
      {children}
    </span>
  )
}
