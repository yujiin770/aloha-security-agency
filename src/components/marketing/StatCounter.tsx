import { useEffect, useRef, useState } from 'react'
import { useInView, useReducedMotion } from 'framer-motion'
import { cn } from '@/utils/cn'

/**
 * Number that counts up when it scrolls into view.
 *
 * `tabular-nums` is not cosmetic here: without fixed-width digits the number
 * visibly jitters as it counts, which reads as a rendering bug rather than an
 * effect. Reduced-motion visitors get the final value immediately.
 */

export interface StatCounterProps {
  value: number
  label: string
  suffix?: string
  prefix?: string
  /** Milliseconds. */
  duration?: number
  inverted?: boolean
  className?: string
}

export function StatCounter({
  value,
  label,
  suffix = '',
  prefix = '',
  duration = 1600,
  inverted = false,
  className,
}: StatCounterProps) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.5 })
  const reduced = useReducedMotion()
  const [animated, setAnimated] = useState(0)

  // Derived rather than pushed into state: a reduced-motion visitor simply
  // reads the final value, so no effect has to write it.
  const display = reduced ? value : animated

  useEffect(() => {
    if (!inView || reduced) return

    let frame = 0
    const start = performance.now()

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      // Ease-out cubic: fast start, gentle settle. A linear count looks
      // mechanical and never quite lands.
      const eased = 1 - Math.pow(1 - progress, 3)
      setAnimated(Math.round(value * eased))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [inView, value, duration, reduced])

  return (
    <div ref={ref} className={cn('text-center', className)}>
      <p
        className={cn(
          'text-4xl font-extrabold tracking-tight tabular-nums sm:text-5xl',
          inverted ? 'text-white' : 'text-ink',
        )}
      >
        {prefix}
        {display.toLocaleString('en-PH')}
        {suffix}
      </p>
      <p
        className={cn(
          'mt-2 text-sm font-medium',
          inverted ? 'text-neutral-400' : 'text-[var(--app-text-muted)]',
        )}
      >
        {label}
      </p>
    </div>
  )
}
