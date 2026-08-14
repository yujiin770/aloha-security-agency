import { ArrowRight, Building2, Phone, UserPlus } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { Reveal, Section, SmartImage } from '@/components/marketing'
import { usePublicSettings } from '@/features/settings/hooks/useSettings'
import { useMediaSlot } from '@/features/cms/hooks/useCms'

/**
 * Closing call to action.
 *
 * Two audiences reach the bottom of this page — people who want a job and
 * businesses that want guards. Making them choose between two equal doors is
 * better than guessing which one they are and getting it wrong.
 */
export function CtaSection() {
  const ctaImage = useMediaSlot('cta_bg')
  const { data: settings } = usePublicSettings()
  const phone = String(settings?.['company.phone'] ?? '+63 900 000 0000')

  return (
    <Section tone="dark" size="lg" className="isolate overflow-hidden">
      <div className="absolute inset-0 -z-10" aria-hidden="true">
        <SmartImage
          src={ctaImage.src}
          alt=""
          width={1920}
          height={800}
          rounded="none"
          wrapperClassName="h-full w-full"
        />
        <div className="absolute inset-0 bg-ink/88" />
        <div className="bg-grid-faint absolute inset-0 opacity-70" />
      </div>

      <div
        className="absolute bottom-0 left-1/4 -z-10 h-72 w-72 rounded-full bg-brand-500/15 blur-3xl"
        aria-hidden="true"
      />

      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-display text-3xl text-white text-balance sm:text-5xl">
          Ready when you are
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-neutral-300">
          Whether you're looking for your next post or looking to secure your
          site, it starts with one conversation.
        </p>
      </Reveal>

      <Reveal delay={0.12} className="mx-auto mt-14 grid max-w-4xl gap-5 sm:grid-cols-2">
        <div className="rounded-[var(--radius-xl)] border border-white/12 bg-white/[0.05] p-8 backdrop-blur-sm">
          <span
            className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-brand-500 text-white"
            aria-hidden="true"
          >
            <UserPlus className="h-5 w-5" />
          </span>
          <h3 className="mt-6 text-xl font-bold text-white">
            Looking for work?
          </h3>
          <p className="mt-2.5 text-[15px] leading-relaxed text-neutral-400">
            Apply online in about ten minutes and track your progress with a
            reference number.
          </p>
          <ButtonLink
            to="/apply"
            size="lg"
            fullWidth
            className="mt-7"
            rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
          >
            Apply now
          </ButtonLink>
        </div>

        <div className="rounded-[var(--radius-xl)] border border-white/12 bg-white/[0.05] p-8 backdrop-blur-sm">
          <span
            className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-laurel-500 text-white"
            aria-hidden="true"
          >
            <Building2 className="h-5 w-5" />
          </span>
          <h3 className="mt-6 text-xl font-bold text-white">
            Need security personnel?
          </h3>
          <p className="mt-2.5 text-[15px] leading-relaxed text-neutral-400">
            Tell us about the site and the shift pattern, and we'll scope the
            detachment with you.
          </p>
          <ButtonLink
            to="/contact"
            variant="inverted"
            size="lg"
            fullWidth
            className="mt-7"
            rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
          >
            Request a quote
          </ButtonLink>
        </div>
      </Reveal>

      <Reveal delay={0.2} className="mt-12 text-center">
        <a
          href={`tel:${phone.replace(/\s/g, '')}`}
          className="inline-flex items-center gap-2.5 text-sm font-medium text-neutral-400 transition-colors hover:text-white"
        >
          <Phone className="h-4 w-4 text-brand-500" aria-hidden="true" />
          Or call us today on {phone}
        </a>
      </Reveal>
    </Section>
  )
}
