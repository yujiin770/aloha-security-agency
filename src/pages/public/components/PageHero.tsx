import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { Container, SmartImage } from '@/components/marketing'
import { cn } from '@/utils/cn'

/**
 * Inner-page hero.
 *
 * Replaces the old `PublicHero`, which was a flat dark band. Shallower than the
 * landing hero on purpose — these pages exist to answer a question the visitor
 * already has, so the header should orient them and get out of the way.
 *
 * Sits under the fixed header, hence the generous top padding.
 */
export function PageHero({
  eyebrow,
  title,
  description,
  image,
  breadcrumb,
  children,
}: {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  /** Optional background photograph; falls back to the brand panel. */
  image?: string
  breadcrumb?: string
  children?: ReactNode
}) {
  const reduced = useReducedMotion()

  return (
    <section className="relative isolate overflow-hidden bg-ink pt-32 pb-20 sm:pt-40 sm:pb-24">
      {image && (
        <div className="absolute inset-0 -z-10" aria-hidden="true">
          <SmartImage
            src={image}
            alt=""
            width={1920}
            height={700}
            priority
            rounded="none"
            wrapperClassName="h-full w-full"
          />
          <div className="absolute inset-0 bg-ink/85" />
        </div>
      )}

      <div className="bg-grid-faint absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
      <div
        className="absolute top-0 right-0 -z-10 h-80 w-80 translate-x-1/3 -translate-y-1/2 rounded-full bg-brand-500/15 blur-3xl"
        aria-hidden="true"
      />

      <Container>
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          {breadcrumb && (
            <nav aria-label="Breadcrumb" className="mb-6">
              <ol className="flex items-center gap-1.5 text-sm text-neutral-500">
                <li>
                  <Link to="/" className="hover:text-white">
                    Home
                  </Link>
                </li>
                <li aria-hidden="true">
                  <ChevronRight className="h-3.5 w-3.5" />
                </li>
                <li aria-current="page" className="text-neutral-300">
                  {breadcrumb}
                </li>
              </ol>
            </nav>
          )}

          {eyebrow && (
            <p
              className={cn(
                'rule-brand text-xs font-semibold tracking-[0.18em] text-brand-400 uppercase',
              )}
            >
              {eyebrow}
            </p>
          )}

          <h1 className="text-display mt-6 max-w-3xl text-4xl text-white text-balance sm:text-5xl lg:text-6xl">
            {title}
          </h1>

          {description && (
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-neutral-400 text-pretty">
              {description}
            </p>
          )}

          {children && <div className="mt-10">{children}</div>}
        </motion.div>
      </Container>
    </section>
  )
}
