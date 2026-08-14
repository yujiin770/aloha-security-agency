import { ArrowRight } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import {
  Reveal,
  RevealGroup,
  RevealItem,
  Section,
  SectionHeading,
} from '@/components/marketing'
import { INDUSTRIES } from '@/features/marketing/content'

/** Industries we protect. Deliberately flatter than the service cards, so the
 *  two grids do not read as the same content twice. */
export function IndustriesSection() {
  return (
    <Section id="industries" tone="muted" size="lg">
      <SectionHeading
        align="center"
        eyebrow="Industries we protect"
        title="Different sites, different risks"
        lead="A retail floor and a distribution yard need different officers, different training and different supervision. We staff for the site, not to a template."
      />

      <RevealGroup
        as="ul"
        className="mt-16 grid gap-px overflow-hidden rounded-[var(--radius-xl)] border border-[var(--app-border)] bg-[var(--app-border)] sm:grid-cols-2 lg:grid-cols-3"
      >
        {INDUSTRIES.map((industry) => (
          <RevealItem
            as="li"
            key={industry.title}
            className="group bg-white p-8 transition-colors hover:bg-brand-50/60"
          >
            <span
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-white transition-colors duration-300 group-hover:bg-brand-500"
              aria-hidden="true"
            >
              <industry.icon className="h-5 w-5" />
            </span>

            <h3 className="mt-5 text-base font-bold text-ink">{industry.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--app-text-muted)]">
              {industry.body}
            </p>
          </RevealItem>
        ))}
      </RevealGroup>

      <Reveal delay={0.15} className="mt-12 text-center">
        <p className="text-[var(--app-text-muted)]">
          Don't see your sector? We scope detachments for most site types.
        </p>
        <ButtonLink
          to="/contact"
          size="lg"
          className="mt-5"
          rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
        >
          Talk to us about your site
        </ButtonLink>
      </Reveal>
    </Section>
  )
}
