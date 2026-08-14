import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { Reveal, Section, SectionHeading, SmartImage } from '@/components/marketing'
import { APP_NAME } from '@/lib/env'
import { useMediaSlot } from '@/features/cms/hooks/useCms'

const POINTS = [
  'Screened against NBI and police clearances before any offer',
  'Licence validity tracked centrally and flagged before it lapses',
  'Every deployment, transfer and end of duty on permanent record',
]

/** Who we are — the first thing after the hero, so it has to earn the scroll. */
export function AboutSection() {
  const aboutImage = useMediaSlot('about')
  return (
    <Section id="about" tone="white" size="lg">
      <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <Reveal direction="right" className="order-2 lg:order-1">
          <div className="relative">
            <SmartImage
              src={aboutImage.src}
              alt="Aloha Security Agency officers on duty"
              width={1200}
              height={900}
              rounded="2xl"
              wrapperClassName="aspect-[4/3] shadow-[var(--shadow-lift)]"
            />

            {/* Overlapping stat plate — gives the image a sense of depth
                without another photograph. */}
            <div className="absolute -right-4 -bottom-8 hidden rounded-[var(--radius-xl)] bg-brand-500 p-6 text-white shadow-[var(--shadow-lift)] sm:block lg:-right-8">
              <p className="text-3xl font-extrabold tracking-tight">SOSIA</p>
              <p className="mt-1 max-w-[9rem] text-xs leading-snug text-white/85">
                Licensed and compliant operations nationwide
              </p>
            </div>

            <div
              className="absolute -top-6 -left-6 -z-10 h-32 w-32 rounded-[var(--radius-2xl)] border-2 border-brand-200"
              aria-hidden="true"
            />
          </div>
        </Reveal>

        <div className="order-1 lg:order-2">
          <SectionHeading
            eyebrow="Who we are"
            title="A security partner that can show its working"
            lead={`${APP_NAME} provides trained, licensed security personnel to commercial, residential, industrial and government clients across the Philippines. We take recruitment seriously because deployment quality starts there.`}
          />

          <Reveal delay={0.1}>
            <p className="mt-6 leading-relaxed text-[var(--app-text-muted)]">
              Most agencies can tell you who is on your site today. We can tell
              you who was on it last March, who cleared them, when their licence
              expires and who approved the transfer — because it is all one
              record rather than a folder of spreadsheets.
            </p>

            <ul className="mt-8 space-y-4">
              {POINTS.map((point) => (
                <li key={point} className="flex items-start gap-3">
                  <CheckCircle2
                    className="mt-0.5 h-5 w-5 shrink-0 text-laurel-500"
                    aria-hidden="true"
                  />
                  <span className="text-[15px] leading-relaxed text-[var(--app-text)]">
                    {point}
                  </span>
                </li>
              ))}
            </ul>

            <ButtonLink
              to="/about"
              variant="outline"
              size="lg"
              className="mt-10"
              rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
            >
              More about the agency
            </ButtonLink>
          </Reveal>
        </div>
      </div>
    </Section>
  )
}
