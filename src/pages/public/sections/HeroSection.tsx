import { motion } from 'framer-motion'
import { ButtonLink } from '@/components/ui/Button'
import { useMediaSlot } from '@/features/cms/hooks/useCms'

export function HeroSection() {
  const heroImage = useMediaSlot('hero')

  return (
    <section className="relative flex min-h-dvh w-full flex-col overflow-hidden bg-white lg:flex-row">

      {/* BACKGROUND DIAGONAL LAYER */}
      {/* Desktop: Right-side red diagonal */}
      <div
        className="absolute inset-0 z-0 bg-brand-500 hidden lg:block"
        style={{ clipPath: 'polygon(58% 0, 100% 0, 100% 100%, 45% 100%)' }}
      />
      {/* Mobile: Bottom-side red area starting with diagonal cut */}
      <div
        className="absolute inset-0 z-0 bg-brand-500 lg:hidden"
        style={{ clipPath: 'polygon(0 45%, 100% 35%, 100% 100%, 0 100%)' }}
      />

      {/* CONTENT WRAPPER */}
      <div className="relative z-10 flex flex-1 flex-col lg:flex-row">

        {/* LOGO SIDE (Top on Mobile | Right on Desktop) */}
        <div className="flex flex-1 items-center justify-center pt-20 pb-10 order-1 lg:order-2 lg:py-0">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="relative flex aspect-square w-[75%] max-w-[320px] items-center justify-center lg:w-[75%] lg:max-w-[550px] lg:ml-20"
          >
            {/* Subtle depth glow */}
            <div className="absolute inset-0 rounded-full bg-black/5 blur-3xl" />

            <img
              src={heroImage.src}
              alt={heroImage.alt}
              className="relative h-full w-full object-contain drop-shadow-[0_30px_50px_rgba(0,0,0,0.2)] lg:drop-shadow-[0_45px_70px_rgba(0,0,0,0.4)]"
            />
          </motion.div>
        </div>

        {/* TEXT SIDE (Bottom on Mobile | Left on Desktop) */}
        <div className="flex flex-1 flex-col justify-center px-6 pt-10 pb-16 text-center items-center order-2 lg:order-1 lg:text-left lg:items-start lg:pt-0 lg:pb-0 lg:pl-20 xl:pl-32">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="max-w-2xl flex flex-col items-center lg:items-start"
          >
            {/* Headline: White on Mobile | Black/Red on Desktop */}
            <h1 className="text-4xl font-black leading-tight tracking-tight text-white lg:text-ink sm:text-6xl lg:text-7xl xl:text-8xl">
              Your Safety, <br />
              <span className="text-white lg:text-brand-500">Our</span> Priority
            </h1>

            {/* Divider Rule: White on Mobile | Red on Desktop */}
            <div className="mt-4 h-1 w-16 bg-white lg:mt-8 lg:h-2 lg:w-24 lg:bg-brand-500 rounded-full" />

            {/* Description: White on Mobile | Gray on Desktop */}
            <p className="mt-6 max-w-sm text-[15px] font-medium leading-relaxed text-white lg:text-neutral-600 lg:mt-10 lg:text-lg sm:text-xl lg:max-w-lg">
              We provide professional, reliable, and well-trained personnel to safeguard your people, property, and business in Zamboanga City since 2002.
            </p>

            {/* Buttons: Pill-shaped (rounded-full) on Mobile | Rectangular (rounded-md) on Desktop */}
            <div className="mt-10 flex flex-col gap-3 w-full max-w-[200px] lg:flex-row lg:max-w-none lg:w-auto lg:gap-5">
              {/* JOIN OUR TEAM - Desktop Adjusted */}
              <ButtonLink
                to="/apply"
                className="w-full rounded-full lg:rounded-md bg-ink lg:w-[280px] lg:py-5 text-xs font-bold uppercase tracking-[0.2em] text-white transition-all hover:bg-neutral-800 shadow-xl"
              >
                Join our team
              </ButtonLink>

              {/* CHECK STATUS - Desktop Adjusted */}
              <ButtonLink
                to="/status"
                variant="secondary"
                className="w-full rounded-full lg:rounded-md border-2 border-white lg:border-ink bg-transparent lg:w-[280px] lg:py-5 text-xs font-bold uppercase tracking-[0.2em] text-white lg:text-ink transition-all hover:bg-white lg:hover:bg-ink lg:hover:text-white"
              >
                Check status
              </ButtonLink>
            </div>
          </motion.div>
        </div>

      </div>
    </section>
  )
}