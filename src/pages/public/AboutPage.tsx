import { ArrowRight, Eye, Target } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import {
  CardIcon,
  MarketingCard,
  Reveal,
  RevealGroup,
  RevealItem,
  Section,
  SectionHeading,
  SmartImage,
} from '@/components/marketing'
import { PageHero } from './components/PageHero'
import { VALUES } from '@/features/marketing/content'
import { usePageMeta } from '@/hooks/usePageMeta'
import { APP_NAME } from '@/lib/env'
import { useMediaSlot } from '@/features/cms/hooks/useCms'

export default function AboutPage() {
  const aboutImage = useMediaSlot('about')
  const teamImage = useMediaSlot('team')
  usePageMeta(
    'About Us',
    `${APP_NAME} is a licensed private security agency operating across the Philippines, providing trained personnel to commercial, residential, industrial and government clients.`,
  )

  return (
    <>
      <PageHero
        breadcrumb="About"
        eyebrow="About us"
        title={APP_NAME}
        description="A licensed private security agency operating across the Philippines, providing trained personnel to commercial, residential, industrial and government clients."
        image={aboutImage.src}
      />

      {/* Mission and vision --------------------------------------------- */}
      <Section tone="white" size="lg">
        <div className="grid gap-14 lg:grid-cols-12 lg:gap-20">
          <div className="lg:col-span-7">
            <SectionHeading
              eyebrow="Our purpose"
              title="Recruitment is where deployment quality begins"
              lead="We take screening seriously because everything downstream depends on it. A guard who was never properly vetted is a risk you inherit on day one."
            />

            <Reveal delay={0.1} className="mt-10 space-y-10">
              <div>
                <h3 className="flex items-center gap-2.5 text-xl font-bold text-ink">
                  <Target className="h-5 w-5 text-brand-500" aria-hidden="true" />
                  Our mission
                </h3>
                <p className="mt-4 leading-relaxed text-[var(--app-text-muted)]">
                  To protect people, property and operations through disciplined,
                  well-trained security personnel — and to give the people who do
                  that work a stable career with clear progression.
                </p>
                <p className="mt-4 leading-relaxed text-[var(--app-text-muted)]">
                  Every applicant is verified against NBI and police clearances,
                  licence status is checked against SOSIA records, and the whole
                  history is retained in one system rather than scattered across
                  folders and spreadsheets.
                </p>
              </div>

              <div>
                <h3 className="flex items-center gap-2.5 text-xl font-bold text-ink">
                  <Eye className="h-5 w-5 text-brand-500" aria-hidden="true" />
                  Our vision
                </h3>
                <p className="mt-4 leading-relaxed text-[var(--app-text-muted)]">
                  To be the private security agency Philippine businesses turn to
                  first — recognised for the calibre of our personnel, the
                  transparency of our operations and the fairness with which we
                  treat our people.
                </p>
              </div>
            </Reveal>
          </div>

          <Reveal direction="left" className="lg:col-span-5">
            <div className="sticky top-28">
              <SmartImage
                src={teamImage.src}
                alt="Aloha Security Agency personnel at a client site"
                width={900}
                height={1200}
                rounded="2xl"
                wrapperClassName="aspect-[3/4] shadow-[var(--shadow-lift)]"
              />
              <div className="mt-6 rounded-[var(--radius-xl)] border border-[var(--app-border)] bg-canvas p-6">
                <p className="text-lg leading-relaxed font-semibold text-ink text-balance">
                  “Vigilance. Integrity. Service.”
                </p>
                <p className="mt-2 text-sm text-[var(--app-text-muted)]">
                  The standard we recruit and train to.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* Values ---------------------------------------------------------- */}
      <Section tone="muted" size="lg">
        <SectionHeading
          align="center"
          eyebrow="Our values"
          title="What we stand for"
          lead="Four principles that decide who we hire and how we operate."
        />

        <RevealGroup as="ul" className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map((value) => (
            <RevealItem as="li" key={value.title}>
              <MarketingCard padding="md" className="h-full">
                <CardIcon>
                  <value.icon className="h-5 w-5" />
                </CardIcon>
                <h3 className="mt-5 text-base font-bold text-ink">
                  {value.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--app-text-muted)]">
                  {value.body}
                </p>
              </MarketingCard>
            </RevealItem>
          ))}
        </RevealGroup>
      </Section>

      {/* CTA -------------------------------------------------------------- */}
      <Section tone="white" size="md">
        <Reveal className="flex flex-wrap items-center justify-between gap-8 rounded-[var(--radius-2xl)] bg-ink p-10 sm:p-14">
          <div className="max-w-xl">
            <h2 className="text-3xl font-bold text-white text-balance">
              Build your career with us
            </h2>
            <p className="mt-4 leading-relaxed text-neutral-400">
              We're hiring across all five roles nationwide. Apply online and
              track your progress with a reference number.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink
              to="/apply"
              size="xl"
              rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
            >
              Apply now
            </ButtonLink>
            <ButtonLink to="/careers" variant="inverted" size="xl">
              View requirements
            </ButtonLink>
          </div>
        </Reveal>
      </Section>
    </>
  )
}
