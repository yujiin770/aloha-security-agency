import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import {
  CardIcon,
  MarketingCard,
  RevealGroup,
  RevealItem,
  Section,
  SectionHeading,
} from '@/components/marketing'
import { SERVICES } from '@/features/marketing/content'

/** Our expertise. Shows six of the eight services; the rest live on /services. */
export function ServicesSection() {
  return (
    <Section id="services" tone="muted" size="lg">
      <div className="flex flex-wrap items-end justify-between gap-8">
        <SectionHeading
          eyebrow="Our expertise"
          title="Security services, end to end"
          lead="From a single reception post to a full detachment with its own coordinator — staffed by officers we recruited, screened and trained ourselves."
          className="max-w-2xl"
        />

        <ButtonLink
          to="/services"
          variant="outline"
          size="lg"
          rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
          className="hidden shrink-0 lg:inline-flex"
        >
          All services
        </ButtonLink>
      </div>

      <RevealGroup
        as="ul"
        className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        {SERVICES.slice(0, 6).map((service) => (
          <RevealItem as="li" key={service.title}>
            <MarketingCard to="/services" className="h-full">
              <CardIcon>
                <service.icon className="h-5 w-5" />
              </CardIcon>

              <h3 className="mt-6 text-lg font-bold text-ink">{service.title}</h3>
              <p className="mt-2.5 flex-1 text-[15px] leading-relaxed text-[var(--app-text-muted)]">
                {service.body}
              </p>

              <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600">
                Learn more
                <ArrowUpRight
                  className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  aria-hidden="true"
                />
              </span>
            </MarketingCard>
          </RevealItem>
        ))}
      </RevealGroup>

      <div className="mt-10 lg:hidden">
        <ButtonLink
          to="/services"
          variant="outline"
          size="lg"
          fullWidth
          rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
        >
          All services
        </ButtonLink>
      </div>
    </Section>
  )
}
