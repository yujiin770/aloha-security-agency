import {
  Placeholder,
  Reveal,
  Section,
  SectionHeading,
  StatCounter,
} from '@/components/marketing'
import { usePublicSettings } from '@/features/settings/hooks/useSettings'

/**
 * By the numbers.
 *
 * The figures come from `settings` rows, not from constants in this file.
 * Headline statistics are factual claims about a real business — hardcoding
 * plausible-looking ones would publish numbers nobody verified. Until an
 * administrator sets them under Settings, the section says so plainly instead
 * of inventing them.
 *
 * Keys: `marketing.stat.personnel`, `.clients`, `.years`, `.posts`
 */

interface StatDefinition {
  key: string
  label: string
  suffix?: string
}

const STATS: StatDefinition[] = [
  { key: 'marketing.stat.personnel', label: 'Security personnel deployed', suffix: '+' },
  { key: 'marketing.stat.clients', label: 'Client sites protected', suffix: '+' },
  { key: 'marketing.stat.posts', label: 'Active posts nationwide', suffix: '+' },
  { key: 'marketing.stat.years', label: 'Years in operation', suffix: '' },
]

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.]/g, ''))
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }
  return null
}

export function StatsSection() {
  const { data: settings } = usePublicSettings()

  const resolved = STATS.map((stat) => ({
    ...stat,
    value: toNumber(settings?.[stat.key]),
  })).filter((stat): stat is StatDefinition & { value: number } => stat.value !== null)

  return (
    <Section tone="dark" size="lg" className="overflow-hidden">
      <div className="bg-grid-faint absolute inset-0 opacity-70" aria-hidden="true" />
      <div
        className="absolute top-1/2 left-1/2 -z-0 h-96 w-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/10 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative">
        <SectionHeading
          align="center"
          inverted
          eyebrow="By the numbers"
          title="Scale, and the discipline to match it"
          lead="Operations across the country, run from one operational record."
        />

        {resolved.length > 0 ? (
          <Reveal delay={0.1}>
            <dl className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
              {resolved.map((stat) => (
                <StatCounter
                  key={stat.key}
                  value={stat.value}
                  label={stat.label}
                  suffix={stat.suffix}
                  inverted
                />
              ))}
            </dl>
          </Reveal>
        ) : (
          <Reveal delay={0.1} className="mt-14">
            <Placeholder
              label="Company statistics not set"
              hint="Add the agency's real figures in the admin console under Settings — personnel deployed, client sites, active posts and years in operation. They will animate into this section once set."
              file="settings keys: marketing.stat.personnel / .clients / .posts / .years"
              className="mx-auto max-w-2xl border-white/15 bg-white/[0.04]"
            />
          </Reveal>
        )}
      </div>
    </Section>
  )
}
