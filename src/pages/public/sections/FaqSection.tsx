import { ArrowRight, MessageCircleQuestion } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { Accordion, Reveal, Section, SectionHeading } from '@/components/marketing'
import { FAQS } from '@/features/marketing/content'
import { usePublicSettings } from '@/features/settings/hooks/useSettings'
import { SUPPORT_EMAIL } from '@/lib/env'

/** FAQ. Answers describe how this system actually behaves, so they stay true. */
export function FaqSection() {
  const { data: settings } = usePublicSettings()
  const email = String(settings?.['company.email'] ?? SUPPORT_EMAIL)

  return (
    <Section id="faq" tone="white" size="lg">
      <div className="grid gap-14 lg:grid-cols-12 lg:gap-20">
        <div className="lg:col-span-5">
          <SectionHeading
            eyebrow="Questions"
            title="Frequently asked"
            lead="The things applicants and clients ask us most. If yours isn't here, just ask."
          />

          <Reveal delay={0.1} className="mt-10">
            <div className="rounded-[var(--radius-xl)] border border-[var(--app-border)] bg-canvas p-7">
              <MessageCircleQuestion
                className="h-8 w-8 text-brand-500"
                aria-hidden="true"
              />
              <h3 className="mt-4 text-lg font-bold text-ink">
                Still need an answer?
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-[var(--app-text-muted)]">
                Our recruitment team replies to enquiries within two working
                days.
              </p>
              <ButtonLink
                href={`mailto:${email}`}
                variant="outline"
                size="lg"
                className="mt-5"
                rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
              >
                Email us
              </ButtonLink>
            </div>
          </Reveal>
        </div>

        <Reveal direction="left" className="lg:col-span-7">
          <Accordion items={FAQS} />
        </Reveal>
      </div>
    </Section>
  )
}
