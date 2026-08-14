import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Camera,
  Car,
  Shield,
  UserCheck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Feedback'
import {
  CardIcon,
  MarketingCard,
  RevealGroup,
  RevealItem,
  Section,
  SectionHeading,
} from '@/components/marketing'
import { usePublicPositions } from '@/features/config/hooks/useConfig'
import type { PositionRow } from '@/types/database.types'

/**
 * Open positions — the one section on this page driven entirely by live data.
 *
 * Requirements are derived from each position's configured fields rather than
 * written as copy, so the page can never advertise a rule the application form
 * does not actually enforce.
 */

const POSITION_ICONS: Record<string, LucideIcon> = {
  security_guard: Shield,
  lady_guard: UserCheck,
  vip_escort: BadgeCheck,
  cctv_operator: Camera,
  driver: Car,
}

function requirementChips(position: PositionRow): string[] {
  const chips: string[] = [`${position.min_age}+ years old`]
  if (position.requires_license) chips.push('Licensed')
  if (position.min_years_experience > 0) {
    chips.push(`${position.min_years_experience}y experience`)
  }
  if (position.min_height_cm) chips.push(`${position.min_height_cm} cm`)
  return chips
}

export function PositionsSection() {
  const { data: positions = [], isLoading } = usePublicPositions()

  return (
    <Section id="positions" tone="white" size="lg">
      <SectionHeading
        align="center"
        eyebrow="Join the team"
        title="Positions open right now"
        lead="Whether you're newly licensed or a seasoned officer, there's a post for you. Apply online and track your application with a reference number."
      />

      {isLoading ? (
        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton
              key={index}
              className="h-64 rounded-[var(--radius-xl)]"
            />
          ))}
        </div>
      ) : positions.length === 0 ? (
        // Recruitment closed, or no position has been made public yet. Say so
        // rather than rendering an empty grid that looks broken.
        <div className="mx-auto mt-14 max-w-xl rounded-[var(--radius-xl)] border border-[var(--app-border)] bg-canvas p-10 text-center">
          <Briefcase
            className="mx-auto h-8 w-8 text-[var(--app-text-subtle)]"
            aria-hidden="true"
          />
          <h3 className="mt-4 text-lg font-bold text-ink">
            No positions open at the moment
          </h3>
          <p className="mt-2 text-[15px] leading-relaxed text-[var(--app-text-muted)]">
            We're not accepting applications right now. Get in touch and we'll
            let you know when recruitment reopens.
          </p>
          <ButtonLink to="/contact" variant="secondary" size="lg" className="mt-6">
            Contact us
          </ButtonLink>
        </div>
      ) : (
        <RevealGroup
          as="ul"
          className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {positions.map((position) => {
            const Icon = POSITION_ICONS[position.code] ?? Briefcase
            return (
              <RevealItem as="li" key={position.id}>
                <MarketingCard to="/apply" className="h-full">
                  <div className="flex items-start justify-between gap-3">
                    <CardIcon>
                      <Icon className="h-5 w-5" />
                    </CardIcon>
                    <Badge tone="success" dot size="sm">
                      Open
                    </Badge>
                  </div>

                  <h3 className="mt-6 text-lg font-bold text-ink">
                    {position.name}
                  </h3>
                  {position.category && (
                    <p className="mt-0.5 text-xs font-medium tracking-wide text-brand-600 uppercase">
                      {position.category}
                    </p>
                  )}

                  <p className="mt-3 flex-1 text-[15px] leading-relaxed text-[var(--app-text-muted)]">
                    {position.description}
                  </p>

                  <ul className="mt-5 flex flex-wrap gap-1.5">
                    {requirementChips(position).map((chip) => (
                      <li
                        key={chip}
                        className="rounded-full bg-canvas px-2.5 py-1 text-[11px] font-medium text-[var(--app-text-muted)]"
                      >
                        {chip}
                      </li>
                    ))}
                  </ul>

                  <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600">
                    Apply for this role
                    <ArrowRight
                      className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </span>
                </MarketingCard>
              </RevealItem>
            )
          })}
        </RevealGroup>
      )}

      <div className="mt-12 flex flex-wrap justify-center gap-3">
        <ButtonLink
          to="/apply"
          size="xl"
          rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
        >
          Start your application
        </ButtonLink>
        <ButtonLink to="/careers" variant="secondary" size="xl">
          See full requirements
        </ButtonLink>
      </div>
    </Section>
  )
}
