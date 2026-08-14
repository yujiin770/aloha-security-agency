import { ArrowRight, CheckCircle2 } from 'lucide-react'
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
import { INDUSTRIES, SERVICES } from '@/features/marketing/content'
import { usePageMeta } from '@/hooks/usePageMeta'
import { useMediaSlot } from '@/features/cms/hooks/useCms'

const ENGAGEMENT = [
  {
    title: 'Site survey',
    body: 'We visit the location, map the risk points and agree the number of posts, shift pattern and supervision level with you.',
  },
  {
    title: 'Detachment build',
    body: 'Officers are selected against the requirements of your site — licensing, experience, and the temperament the role calls for.',
  },
  {
    title: 'Deployment',
    body: 'Personnel are assigned with a named coordinator, and every assignment is recorded against the post from day one.',
  },
  {
    title: 'Ongoing reporting',
    body: 'Headcount, shift coverage and staffing gaps are tracked continuously, so you always know your post is filled.',
  },
]

export default function ServicesPage() {
  const guardingImage = useMediaSlot('service_guarding')
  const cctvImage = useMediaSlot('service_cctv')
  usePageMeta(
    'Security Services',
    'Manned guarding, lady guard services, VIP escort, CCTV monitoring, secure transport and detachment management across the Philippines.',
  )

  return (
    <>
      <PageHero
        breadcrumb="Services"
        eyebrow="What we do"
        title="Security services built around accountability"
        description="Every officer we deploy is screened, licensed and tracked in a single operational record — from application through to end of duty."
        image={guardingImage.src}
      >
        <ButtonLink
          to="/contact"
          size="xl"
          rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
        >
          Request security services
        </ButtonLink>
      </PageHero>

      {/* Services grid ------------------------------------------------- */}
      <Section tone="white" size="lg">
        <SectionHeading
          align="center"
          eyebrow="Our services"
          title="Cover for every kind of post"
          lead="Eight service lines, staffed from the same vetted roster and managed under the same standards."
        />

        <RevealGroup
          as="ul"
          className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
        >
          {SERVICES.map((service) => (
            <RevealItem as="li" key={service.title}>
              <MarketingCard padding="md" className="h-full">
                <CardIcon>
                  <service.icon className="h-5 w-5" />
                </CardIcon>
                <h3 className="mt-5 text-base font-bold text-ink">
                  {service.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--app-text-muted)]">
                  {service.body}
                </p>
              </MarketingCard>
            </RevealItem>
          ))}
        </RevealGroup>
      </Section>

      {/* How we engage -------------------------------------------------- */}
      <Section tone="muted" size="lg">
        <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
          <div>
            <SectionHeading
              eyebrow="How we engage"
              title="From first call to a staffed post"
              lead="A predictable process, so you know what happens next at every stage."
            />

            <Reveal delay={0.1} className="mt-10">
              <SmartImage
                src={cctvImage.src}
                alt="Command centre operator monitoring site cameras"
                width={1200}
                height={800}
                rounded="2xl"
                wrapperClassName="aspect-[3/2] shadow-[var(--shadow-lift)]"
              />
            </Reveal>
          </div>

          <RevealGroup as="ol" className="space-y-8">
            {ENGAGEMENT.map((step, index) => (
              <RevealItem as="li" key={step.title} className="flex gap-5">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-sm font-bold text-white"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-lg font-bold text-ink">{step.title}</h3>
                  <p className="mt-2 leading-relaxed text-[var(--app-text-muted)]">
                    {step.body}
                  </p>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </Section>

      {/* Industries ----------------------------------------------------- */}
      <Section tone="white" size="lg">
        <SectionHeading
          align="center"
          eyebrow="Industries"
          title="Sectors we protect"
        />

        <RevealGroup as="ul" className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {INDUSTRIES.map((industry) => (
            <RevealItem as="li" key={industry.title}>
              <div className="flex h-full items-start gap-4 rounded-[var(--radius-xl)] border border-[var(--app-border)] p-6">
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0 text-laurel-500"
                  aria-hidden="true"
                />
                <div>
                  <h3 className="font-bold text-ink">{industry.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--app-text-muted)]">
                    {industry.body}
                  </p>
                </div>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </Section>

      {/* CTA ------------------------------------------------------------ */}
      <Section tone="dark" size="md" className="overflow-hidden">
       
        <Reveal className="relative flex flex-wrap items-center justify-between gap-8">
          <div className="max-w-xl">
            <h2 className="text-3xl font-bold text-white text-balance sm:text-4xl">
              Looking for security personnel for your site?
            </h2>
            <p className="mt-4 leading-relaxed text-neutral-400">
              Tell us the location, the number of posts and the shift pattern.
              We'll come back with a scoped detachment.
            </p>
          </div>
          <ButtonLink
            to="/contact"
            size="xl"
            rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
          >
            Get in touch
          </ButtonLink>
        </Reveal>
      </Section>
    </>
  )
}
