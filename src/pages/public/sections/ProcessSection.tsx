import { ArrowRight } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import {
  Reveal,
  RevealGroup,
  RevealItem,
  Section,
  SectionHeading,
  SmartImage,
} from '@/components/marketing'
import { PROCESS_STEPS } from '@/features/marketing/content'
import { useMediaSlot } from '@/features/cms/hooks/useCms'

/** How to join — the real four-stage pipeline the database enforces. */
export function ProcessSection() {
  const trainingImage = useMediaSlot('training')
  return (
    <Section id="process" tone="dark" size="lg" className="overflow-hidden">
  

      <div className="relative grid gap-16 lg:grid-cols-12 lg:gap-20">
        <div className="lg:col-span-5">
          <SectionHeading
            inverted
            eyebrow="How to join"
            title="Four steps from application to post"
            lead="No agency fees, no runaround. You'll know where you stand at every stage — and you can check it yourself at any time."
          />

          <Reveal delay={0.1} className="mt-10">
            <SmartImage
              src={trainingImage.src}
              alt="Pre-deployment training session"
              width={1200}
              height={800}
              rounded="2xl"
              wrapperClassName="aspect-[3/2] hidden lg:block"
            />

            <ButtonLink
              to="/apply"
              size="xl"
              className="mt-10"
              rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
            >
              Begin your application
            </ButtonLink>
          </Reveal>
        </div>

        <RevealGroup as="ol" className="relative lg:col-span-7">
          {/* Connecting rail behind the step markers. */}
          <div
            className="absolute top-2 bottom-8 left-[27px] w-px bg-gradient-to-b from-brand-500/60 via-white/15 to-transparent"
            aria-hidden="true"
          />

          {PROCESS_STEPS.map((step, index) => (
            <RevealItem as="li" key={step.title} className="relative flex gap-6 pb-12 last:pb-0">
              <span
                className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/12 bg-ink text-lg font-extrabold text-brand-500"
                aria-hidden="true"
              >
                {String(index + 1).padStart(2, '0')}
              </span>

              <div className="pt-2">
                <h3 className="text-xl font-bold text-white">{step.title}</h3>
                <p className="mt-2.5 leading-relaxed text-neutral-400">
                  {step.body}
                </p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </Section>
  )
}
