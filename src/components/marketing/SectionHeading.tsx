import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { Reveal } from './Reveal'

/**
 * Eyebrow + title + lead paragraph.
 *
 * Was written inline on six-plus sections, each drifting slightly in size and
 * spacing. Centralising it is what makes the page read as one document.
 */

export interface SectionHeadingProps {
  eyebrow?: string
  title: ReactNode
  lead?: ReactNode
  align?: 'left' | 'center'
  /** Dark sections need inverted text. */
  inverted?: boolean
  className?: string
  /** Rendered under the lead — usually a CTA. */
  children?: ReactNode
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = 'left',
  inverted = false,
  className,
  children,
}: SectionHeadingProps) {
  return (
    <Reveal
      className={cn(
        'max-w-3xl',
        align === 'center' && 'mx-auto text-center',
        className,
      )}
    >
      {eyebrow && (
        <p
          className={cn(
            'rule-brand text-xs font-semibold tracking-[0.18em] uppercase',
            align === 'center' && 'rule-brand-center',
            inverted ? 'text-brand-400' : 'text-brand-600',
          )}
        >
          {eyebrow}
        </p>
      )}

      <h2
        className={cn(
          'mt-5 text-3xl font-bold tracking-[-0.022em] text-balance sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]',
          inverted ? 'text-white' : 'text-ink',
        )}
      >
        {title}
      </h2>

      {lead && (
        <p
          className={cn(
            'mt-5 text-base leading-relaxed text-pretty sm:text-lg',
            inverted ? 'text-neutral-400' : 'text-[var(--app-text-muted)]',
          )}
        >
          {lead}
        </p>
      )}

      {children && <div className="mt-8">{children}</div>}
    </Reveal>
  )
}
