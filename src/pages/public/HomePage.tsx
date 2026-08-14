import { usePageMeta } from '@/hooks/usePageMeta'
import { APP_NAME } from '@/lib/env'

import { HeroSection } from './sections/HeroSection'
import { AboutSection } from './sections/AboutSection'
import { ServicesSection } from './sections/ServicesSection'
import { WhyChooseSection } from './sections/WhyChooseSection'
import { StatsSection } from './sections/StatsSection'
import { IndustriesSection } from './sections/IndustriesSection'
import { PositionsSection } from './sections/PositionsSection'
import { ProcessSection } from './sections/ProcessSection'
import { FaqSection } from './sections/FaqSection'
import { CtaSection } from './sections/CtaSection'
import {
  AccreditationsSection,
  NewsSection,
  TestimonialsSection,
  TrustBarSection,
} from './sections/SocialProofSections'

/**
 * Landing page.
 *
 * Ordered as a narrative rather than a list of blocks: establish credibility,
 * explain who we are, show what we do, justify the choice, prove the scale,
 * name the sectors, invite an application, then close. Each section hands off
 * to the next.
 *
 * Backgrounds alternate white → off-white so adjacent sections separate without
 * borders; dark is rationed to the hero, the stats band, the process band and
 * the closing CTA, which is what keeps the page feeling light.
 */
export default function HomePage() {
  usePageMeta(
    `${APP_NAME} — Licensed Security Services & Careers`,
    'Aloha Security Agency recruits, trains and deploys licensed security personnel across the Philippines. Apply online for security guard, lady guard, VIP escort, CCTV operator and driver positions.',
  )

  return (
    <>
      {/* 1 — Establish */}
      <HeroSection />
      <TrustBarSection />

      {/* 2 — Who we are */}
      <AboutSection />

      {/* 3 — What we do */}
      <ServicesSection />

      {/* 4 — Why us */}
      <WhyChooseSection />

      {/* 5 — Proof of scale */}
      <StatsSection />

      {/* 6 — Where we work */}
      <IndustriesSection />

      {/* 7 — Come and work here */}
      <PositionsSection />
      <ProcessSection />

      {/* 8 — Reassurance */}
      <TestimonialsSection />
      <AccreditationsSection />

      {/* 9 — Answers */}
      <FaqSection />

      {/* 10 — Keeping in touch */}
      <NewsSection />

      {/* 11 — Close */}
      <CtaSection />
    </>
  )
}
