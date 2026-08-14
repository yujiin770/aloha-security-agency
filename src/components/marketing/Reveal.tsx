import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { Variants } from 'framer-motion'

/**
 * Scroll-triggered entrance animation.
 *
 * The global `prefers-reduced-motion` rule in `styles/index.css` kills CSS
 * animation, but it cannot touch JS-driven transforms — framer-motion would
 * happily keep animating. So this checks `useReducedMotion()` and renders a
 * plain element when set. Without that, a reduced-motion visitor could be left
 * staring at content stuck at `opacity: 0`, which is a genuine accessibility
 * failure rather than a cosmetic one.
 */

type Direction = 'up' | 'down' | 'left' | 'right' | 'none'

const DISTANCE = 24

function variantsFor(direction: Direction, scale: boolean): Variants {
  const offset =
    direction === 'up'
      ? { y: DISTANCE }
      : direction === 'down'
        ? { y: -DISTANCE }
        : direction === 'left'
          ? { x: DISTANCE }
          : direction === 'right'
            ? { x: -DISTANCE }
            : {}

  return {
    hidden: { opacity: 0, ...offset, ...(scale ? { scale: 0.96 } : {}) },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
    },
  }
}

export interface RevealProps {
  children: ReactNode
  direction?: Direction
  /** Seconds. Use small increments to stagger siblings. */
  delay?: number
  scale?: boolean
  className?: string
  as?: 'div' | 'li' | 'span' | 'section' | 'article'
}

export function Reveal({
  children,
  direction = 'up',
  delay = 0,
  scale = false,
  className,
  as = 'div',
}: RevealProps) {
  const reduced = useReducedMotion()
  const MotionTag = motion[as]

  if (reduced) {
    const Tag = as
    return <Tag className={className}>{children}</Tag>
  }

  return (
    <MotionTag
      className={className}
      initial="hidden"
      whileInView="visible"
      // `once` matters: re-animating on every scroll past is the difference
      // between "polished" and "distracting".
      viewport={{ once: true, amount: 0.2, margin: '0px 0px -80px 0px' }}
      variants={variantsFor(direction, scale)}
      transition={{ delay }}
    >
      {children}
    </MotionTag>
  )
}

/**
 * Staggers its children automatically. Use for card grids so each item does not
 * need its own hand-tuned delay.
 */
export function RevealGroup({
  children,
  className,
  stagger = 0.08,
  as = 'div',
}: {
  children: ReactNode
  className?: string
  stagger?: number
  as?: 'div' | 'ul' | 'ol'
}) {
  const reduced = useReducedMotion()
  const MotionTag = motion[as]

  if (reduced) {
    const Tag = as
    return <Tag className={className}>{children}</Tag>
  }

  return (
    <MotionTag
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15, margin: '0px 0px -80px 0px' }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger } },
      }}
    >
      {children}
    </MotionTag>
  )
}

/** Child of `RevealGroup` — inherits the parent's stagger timing. */
export function RevealItem({
  children,
  className,
  as = 'div',
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'li' | 'article'
}) {
  const reduced = useReducedMotion()
  const MotionTag = motion[as]

  if (reduced) {
    const Tag = as
    return <Tag className={className}>{children}</Tag>
  }

  return (
    <MotionTag className={className} variants={variantsFor('up', false)}>
      {children}
    </MotionTag>
  )
}
