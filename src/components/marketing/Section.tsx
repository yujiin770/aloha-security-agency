import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

/**
 * Marketing section wrapper.
 *
 * Replaces the `mx-auto w-full max-w-7xl px-4 sm:px-6` + `py-*` block that was
 * copy-pasted about a dozen times across the public pages. Owning the rhythm in
 * one place is what keeps a long scrolling page feeling composed rather than
 * assembled.
 *
 * `tone` drives the alternating white / off-white / dark banding the brief asks
 * for — roughly 80% white, 15% red accent, 5% dark.
 */

type Tone = 'white' | 'muted' | 'dark' | 'transparent'
type Size = 'sm' | 'md' | 'lg'

const TONES: Record<Tone, string> = {
  white: 'bg-white text-ink',
  muted: 'bg-canvas text-ink',
  dark: 'bg-ink text-white',
  transparent: '',
}

const SIZES: Record<Size, string> = {
  sm: 'py-14 sm:py-16',
  md: 'py-20 sm:py-24',
  lg: 'py-24 sm:py-32',
}

export interface SectionProps {
  children: ReactNode
  tone?: Tone
  size?: Size
  /** Anchor target for in-page navigation. */
  id?: string
  className?: string
  /** Inner container class — widen or narrow the measure per section. */
  containerClassName?: string
  /** Skip the max-width container entirely (full-bleed backgrounds). */
  bleed?: boolean
  as?: 'section' | 'div' | 'footer' | 'header'
}

export function Section({
  children,
  tone = 'white',
  size = 'md',
  id,
  className,
  containerClassName,
  bleed = false,
  as: Tag = 'section',
}: SectionProps) {
  return (
    <Tag
      id={id}
      className={cn(
        'relative',
        TONES[tone],
        !bleed && SIZES[size],
        // Anchored sections need to clear the sticky header when jumped to.
        id && 'scroll-mt-20',
        className,
      )}
    >
      {bleed ? (
        children
      ) : (
        <div
          className={cn(
            'mx-auto w-full max-w-7xl px-5 sm:px-6 lg:px-8',
            containerClassName,
          )}
        >
          {children}
        </div>
      )}
    </Tag>
  )
}

/** Standalone container, for full-bleed sections that still need a measure. */
export function Container({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mx-auto w-full max-w-7xl px-5 sm:px-6 lg:px-8', className)}>
      {children}
    </div>
  )
}
