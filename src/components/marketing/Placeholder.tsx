import type { ReactNode } from 'react'
import { FileEdit } from 'lucide-react'
import { cn } from '@/utils/cn'

/**
 * "Content needed" state for sections that must not be invented.
 *
 * Testimonials, client lists, accreditations and news make claims about a real
 * business and real third parties. Writing plausible-looking filler for those
 * would put false statements on a public site — a visitor cannot tell invented
 * praise from earned praise, which is exactly what makes it dishonest.
 *
 * So these sections are built for real, and render this until someone supplies
 * the genuine content. It is deliberately unmistakable: dashed border, muted
 * palette, and a note naming the file to edit.
 */

export function Placeholder({
  label,
  hint,
  file,
  className,
  children,
}: {
  /** What is missing, e.g. "Client testimonials". */
  label: string
  /** How to supply it. */
  hint: string
  /** Where the content lives, shown to developers. */
  file?: string
  className?: string
  /** Optional skeleton of the eventual layout. */
  children?: ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-xl)] border-2 border-dashed border-[var(--app-border)] bg-canvas/60 p-8 text-center sm:p-10',
        className,
      )}
    >
      <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-[var(--app-text-subtle)] shadow-[var(--shadow-soft)]">
        <FileEdit className="h-5 w-5" aria-hidden="true" />
      </span>

      <p className="mt-4 text-sm font-semibold text-[var(--app-text)]">{label}</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-[var(--app-text-muted)]">
        {hint}
      </p>

      {file && (
        <p className="mt-3 font-mono text-[11px] text-[var(--app-text-subtle)]">
          {file}
        </p>
      )}

      {children && <div className="mt-8">{children}</div>}
    </div>
  )
}

/**
 * Neutral grey bar standing in for a client logo.
 *
 * Not a real company's mark, and not shaped to imply one — implying client
 * relationships that do not exist is the same problem as inventing a
 * testimonial, just quieter.
 */
export function LogoPlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex h-10 w-28 items-center justify-center rounded-md bg-[var(--app-border)]/70',
        className,
      )}
      aria-hidden="true"
    />
  )
}
