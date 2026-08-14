import {
  CardIcon,
  MarketingCard,
  RevealGroup,
  RevealItem,
  Section,
  SectionHeading,
} from '@/components/marketing'
import { DIFFERENTIATORS } from '@/features/marketing/content'
import { APP_NAME } from '@/lib/env'

/**
 * Why choose us.
 *
 * Each claim maps to a control the system genuinely enforces — licence expiry
 * flags, clearance verification, deployment history. Nothing here is an
 * aspiration dressed as a fact.
 */
export function WhyChooseSection() {
  return (
    <Section id="why-us" tone="white" size="lg">
      <SectionHeading
        align="center"
        eyebrow="Why choose us"
        title={`What sets ${APP_NAME} apart`}
        lead="Anyone can put a uniform on a post. The difference is what you can prove about the person wearing it."
      />

      <RevealGroup
        as="ul"
        className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        {DIFFERENTIATORS.map((item) => (
          <RevealItem as="li" key={item.title}>
            <MarketingCard interactive className="h-full">
              <CardIcon>
                <item.icon className="h-5 w-5" />
              </CardIcon>

              <h3 className="mt-6 text-lg font-bold text-ink">{item.title}</h3>
              <p className="mt-2.5 text-[15px] leading-relaxed text-[var(--app-text-muted)]">
                {item.body}
              </p>
            </MarketingCard>
          </RevealItem>
        ))}
      </RevealGroup>
    </Section>
  )
}
