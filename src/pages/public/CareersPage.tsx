import { ArrowRight, CheckCircle2, FileText, Search } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Feedback'
import {
  MarketingCard,
  Reveal,
  RevealGroup,
  RevealItem,
  Section,
  SectionHeading,
} from '@/components/marketing'
import { PageHero } from './components/PageHero'
import { PROCESS_STEPS } from '@/features/marketing/content'
import { usePublicPositions } from '@/features/config/hooks/useConfig'
import { usePageMeta } from '@/hooks/usePageMeta'
import type { PositionRow } from '@/types/database.types'
import { useMediaSlot } from '@/features/cms/hooks/useCms'

const GENERAL_REQUIREMENTS = [
  'Filipino citizen, at least 18 years old',
  'At least high school graduate (senior high or college preferred)',
  'Physically and mentally fit, of good moral character',
  'Valid NBI clearance (issued within the last 6 months)',
  'Police and barangay clearance',
  'Valid government-issued ID',
  'No pending criminal case',
]

const DOCUMENTS = [
  'Résumé or bio-data with recent 2×2 photo',
  'NBI clearance',
  'Police clearance',
  'Barangay clearance',
  'Birth certificate (PSA)',
  'Diploma or transcript of records',
  'LESP / SOSIA security licence (for licensed roles)',
  'Training certificate (Basic Security Guard Course)',
  'SSS, PhilHealth, Pag-IBIG and TIN numbers',
]

/**
 * Requirement bullets derived from the position's configured fields.
 *
 * Built from data rather than written as copy, so this page cannot advertise a
 * rule the application form does not actually enforce.
 */
function requirementsFor(position: PositionRow): string[] {
  const items: string[] = []

  items.push(
    position.max_age
      ? `Aged ${position.min_age}–${position.max_age}`
      : `At least ${position.min_age} years old`,
  )

  if (position.requires_license) {
    items.push('Valid LESP/SOSIA security licence')
    items.push('Completed Basic Security Guard Course')
  }
  if (position.min_years_experience > 0) {
    items.push(
      `At least ${position.min_years_experience} year${position.min_years_experience === 1 ? '' : 's'} of relevant experience`,
    )
  }
  if (position.min_height_cm) {
    items.push(`Minimum height ${position.min_height_cm} cm`)
  }

  return items
}

export default function CareersPage() {
  const trainingImage = useMediaSlot('training')
  usePageMeta(
    'Careers',
    'Now hiring security guards, lady guards, VIP escorts, CCTV operators and drivers across the Philippines. See requirements and apply online.',
  )

  const { data: positions = [], isLoading } = usePublicPositions()

  return (
    <>
      <PageHero
        breadcrumb="Careers"
        eyebrow="Careers"
        title="Build a career in professional security"
        description="We're hiring across all our roles nationwide. Here's what you need, and what happens after you apply."
        image={trainingImage.src}
      >
        <div className="flex flex-wrap gap-3">
          <ButtonLink
            to="/apply"
            size="xl"
            rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
          >
            Start your application
          </ButtonLink>
          <ButtonLink
            to="/status"
            variant="inverted"
            size="xl"
            leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
          >
            Check your status
          </ButtonLink>
        </div>
      </PageHero>

      {/* Open positions -------------------------------------------------- */}
      <Section tone="white" size="lg">
        <div className="grid gap-14 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <SectionHeading
              eyebrow="Open roles"
              title="Positions we're hiring for"
              lead="Each role lists the requirements configured for it, so you know before you apply whether you qualify."
            />

            {isLoading ? (
              <div className="mt-12 space-y-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-44 rounded-[var(--radius-xl)]" />
                ))}
              </div>
            ) : positions.length === 0 ? (
              <div className="mt-12 rounded-[var(--radius-xl)] border border-[var(--app-border)] bg-canvas p-10 text-center">
                <h3 className="text-lg font-bold text-ink">
                  No positions open at the moment
                </h3>
                <p className="mt-2 text-[15px] text-[var(--app-text-muted)]">
                  We're not accepting applications right now. Check back soon.
                </p>
              </div>
            ) : (
              <RevealGroup as="ul" className="mt-12 space-y-4">
                {positions.map((position) => (
                  <RevealItem as="li" key={position.id}>
                    <MarketingCard padding="md">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-bold text-ink">
                            {position.name}
                          </h3>
                          {position.category && (
                            <p className="mt-0.5 text-xs font-semibold tracking-wide text-brand-600 uppercase">
                              {position.category}
                            </p>
                          )}
                        </div>
                        <Badge tone="success" dot>
                          Open
                        </Badge>
                      </div>

                      {position.description && (
                        <p className="mt-3 leading-relaxed text-[var(--app-text-muted)]">
                          {position.description}
                        </p>
                      )}

                      <ul className="mt-5 space-y-2">
                        {requirementsFor(position).map((requirement) => (
                          <li
                            key={requirement}
                            className="flex items-start gap-2.5 text-sm text-[var(--app-text-muted)]"
                          >
                            <CheckCircle2
                              className="mt-0.5 h-4 w-4 shrink-0 text-laurel-500"
                              aria-hidden="true"
                            />
                            {requirement}
                          </li>
                        ))}
                      </ul>

                      <ButtonLink
                        to="/apply"
                        variant="outline"
                        className="mt-6 w-fit"
                        rightIcon={
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        }
                      >
                        Apply for this role
                      </ButtonLink>
                    </MarketingCard>
                  </RevealItem>
                ))}
              </RevealGroup>
            )}
          </div>

          {/* Requirements aside ------------------------------------------ */}
          <aside className="space-y-5 lg:col-span-5">
            <Reveal direction="left">
              <div className="rounded-[var(--radius-xl)] border border-[var(--app-border)] bg-canvas p-7">
                <h2 className="text-lg font-bold text-ink">
                  General requirements
                </h2>
                <ul className="mt-5 space-y-3">
                  {GENERAL_REQUIREMENTS.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 text-sm text-[var(--app-text-muted)]"
                    >
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0 text-laurel-500"
                        aria-hidden="true"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <Reveal direction="left" delay={0.1}>
              <div className="rounded-[var(--radius-xl)] border border-[var(--app-border)] bg-white p-7 shadow-[var(--shadow-soft)]">
                <h2 className="flex items-center gap-2.5 text-lg font-bold text-ink">
                  <FileText className="h-5 w-5 text-brand-500" aria-hidden="true" />
                  Documents to prepare
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--app-text-muted)]">
                  Upload your résumé, ID and clearances with your application.
                  The rest can be brought to interview.
                </p>
                <ul className="mt-5 space-y-2 text-sm text-[var(--app-text-muted)]">
                  {DOCUMENTS.map((document) => (
                    <li key={document} className="flex items-start gap-2.5">
                      <span
                        className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--app-text-subtle)]"
                        aria-hidden="true"
                      />
                      {document}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </aside>
        </div>
      </Section>

      {/* Process --------------------------------------------------------- */}
      <Section tone="muted" size="lg">
        <SectionHeading
          align="center"
          eyebrow="What happens next"
          title="From application to deployment"
        />

        <RevealGroup as="ol" className="mt-16 grid gap-6 md:grid-cols-4">
          {PROCESS_STEPS.map((step, index) => (
            <RevealItem as="li" key={step.title} className="relative">
              <span
                className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-base font-bold text-white"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <h3 className="mt-5 text-base font-bold text-ink">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--app-text-muted)]">
                {step.body}
              </p>
            </RevealItem>
          ))}
        </RevealGroup>

        <Reveal delay={0.2} className="mt-14 text-center">
          <ButtonLink
            to="/apply"
            size="xl"
            rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
          >
            Apply now
          </ButtonLink>
        </Reveal>
      </Section>
    </>
  )
}
