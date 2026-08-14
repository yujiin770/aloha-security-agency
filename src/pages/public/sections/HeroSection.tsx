import { useRef } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { ArrowRight, CheckCircle2, MousePointer2, Search } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { Container, SmartImage } from '@/components/marketing'
import { TRUST_BADGES } from '@/features/marketing/content'
import { usePublicPositions } from '@/features/config/hooks/useConfig'
import { useMediaSlot } from '@/features/cms/hooks/useCms'

/**
 * Landing hero.
 *
 * Full-bleed photograph behind a dark gradient, with the headline and CTAs over
 * it. The background image sits on a slow parallax as the page scrolls; the
 * effect is subtle on purpose — enough to give the section depth, not enough to
 * fight the reader.
 *
 * The stat row uses real data where it can: the open-position count comes from
 * the `positions` table, so it can never advertise roles that are closed.
 */
export function HeroSection() {
  const ref = useRef<HTMLElement>(null)
  const reduced = useReducedMotion()
  const { data: positions = [] } = usePublicPositions()
  const heroImage = useMediaSlot('hero')

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  })
  const imageY = useTransform(scrollYProgress, [0, 1], ['0%', '18%'])
  const contentOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0])

  return (
    <section
      ref={ref}
      className="relative isolate flex min-h-dvh items-center overflow-hidden bg-ink pt-28 pb-20 sm:pt-32"
    >
      {/* Background ---------------------------------------------------- */}
      <motion.div
        style={reduced ? undefined : { y: imageY }}
        className="absolute inset-0 -z-10 h-[118%]"
        aria-hidden="true"
      >
        <SmartImage
          src={heroImage.src}
          alt=""
          width={1920}
          height={1080}
          priority
          rounded="none"
          wrapperClassName="h-full w-full"
          className="h-full w-full object-cover"
        />
        {/* Two overlays: a vertical gradient for text contrast, and a warm
            brand wash so the photograph reads as ours rather than stock. */}
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/85 to-ink/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-transparent to-ink/70" />
        <div className="bg-grid-faint absolute inset-0 opacity-60" />
      </motion.div>

      <div
        className="absolute top-0 right-0 -z-10 h-[38rem] w-[38rem] translate-x-1/3 -translate-y-1/3 rounded-full bg-brand-500/12 blur-3xl"
        aria-hidden="true"
      />

      <Container>
        <motion.div
          style={reduced ? undefined : { opacity: contentOpacity }}
          className="grid items-center gap-16 lg:grid-cols-12"
        >
          {/* Copy -------------------------------------------------------- */}
          <div className="lg:col-span-7">
            <motion.p
              initial={reduced ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold tracking-[0.14em] text-white/80 uppercase backdrop-blur-sm"
            >
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
              </span>
              Now hiring nationwide
            </motion.p>

            <motion.h1
              initial={reduced ? false : { opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.08 }}
              className="text-display mt-7 text-[2.75rem] text-white text-balance sm:text-6xl lg:text-[4.25rem]"
            >
              Security you can
              <span className="relative ml-3 inline-block text-brand-500">
                account for
                <svg
                  viewBox="0 0 300 12"
                  className="absolute -bottom-2 left-0 h-2.5 w-full text-brand-500/50"
                  fill="none"
                  aria-hidden="true"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M2 9C60 3 140 2 298 6"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </motion.h1>

            <motion.p
              initial={reduced ? false : { opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.16 }}
              className="mt-8 max-w-xl text-lg leading-relaxed text-neutral-300 text-pretty"
            >
              Aloha Security Agency recruits, trains and deploys licensed
              security personnel across the Philippines — with every clearance
              verified and every deployment on record.
            </motion.p>

            <motion.div
              initial={reduced ? false : { opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.24 }}
              className="mt-10 flex flex-wrap gap-3"
            >
              <ButtonLink
                to="/apply"
                size="xl"
                rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
              >
                Apply now
              </ButtonLink>
              <ButtonLink
                to="/contact"
                size="xl"
                variant="inverted"
                leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
              >
                Request security services
              </ButtonLink>
            </motion.div>

            <motion.ul
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.36 }}
              className="mt-12 flex flex-wrap gap-x-7 gap-y-3"
            >
              {TRUST_BADGES.map((badge) => (
                <li
                  key={badge}
                  className="flex items-center gap-2 text-sm font-medium text-neutral-400"
                >
                  <CheckCircle2
                    className="h-4 w-4 shrink-0 text-laurel-500"
                    aria-hidden="true"
                  />
                  {badge}
                </li>
              ))}
            </motion.ul>
          </div>

          {/* Floating stat cards ---------------------------------------- */}
          <div className="lg:col-span-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:ml-auto lg:max-w-sm lg:grid-cols-1">
              <FloatCard
                delay={0.3}
                float={0}
                value={
                  positions.length > 0 ? String(positions.length) : '—'
                }
                label="Open positions"
                detail="Accepting applications now"
              />
              <FloatCard
                delay={0.4}
                float={1}
                value="24/7"
                label="Command centre"
                detail="Monitored around the clock"
              />
              <FloatCard
                delay={0.5}
                float={2}
                value="100%"
                label="Cleared personnel"
                detail="NBI verified before deployment"
                highlight
              />
            </div>
          </div>
        </motion.div>
      </Container>

      {/* Scroll cue ---------------------------------------------------- */}
      <motion.a
        href="#about"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.6 }}
        className="absolute inset-x-0 bottom-7 mx-auto flex w-fit flex-col items-center gap-2 text-white/50 transition-colors hover:text-white"
      >
        <span className="text-[10px] font-semibold tracking-[0.2em] uppercase">
          Scroll
        </span>
        <motion.span
          animate={reduced ? undefined : { y: [0, 7, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          aria-hidden="true"
        >
          <MousePointer2 className="h-4 w-4 rotate-180" />
        </motion.span>
      </motion.a>
    </section>
  )
}

function FloatCard({
  value,
  label,
  detail,
  delay,
  float,
  highlight = false,
}: {
  value: string
  label: string
  detail: string
  delay: number
  float: number
  highlight?: boolean
}) {
  const reduced = useReducedMotion()

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay }}
      className="rounded-[var(--radius-xl)] border border-white/12 bg-white/[0.06] p-5 backdrop-blur-md"
    >
      <motion.div
        // Each card drifts on its own phase, so the group breathes rather than
        // moving as one block.
        animate={reduced ? undefined : { y: [0, -7, 0] }}
        transition={{
          duration: 4.5 + float,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: float * 0.5,
        }}
      >
        <p
          className={
            highlight
              ? 'text-3xl font-extrabold tracking-tight text-brand-500'
              : 'text-3xl font-extrabold tracking-tight text-white'
          }
        >
          {value}
        </p>
        <p className="mt-1 text-sm font-semibold text-white">{label}</p>
        <p className="mt-0.5 text-xs text-neutral-400">{detail}</p>
      </motion.div>
    </motion.div>
  )
}
