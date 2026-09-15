import { useState } from 'react'
import { motion } from 'framer-motion'
import { ButtonLink } from '@/components/ui/Button'
import { useMediaSlot } from '@/features/cms/hooks/useCms'
import { cn } from '@/utils/cn'

export function HeroSection() {
  const heroImage = useMediaSlot('hero')
  const [imageLoaded, setImageLoaded] = useState(false)
  const [hasSplashed] = useState(() => {
    const played = sessionStorage.getItem('aloha_splashed')
    if (!played) {
      sessionStorage.setItem('aloha_splashed', 'true')
      return false
    }
    return true
  })

  const START_DELAY = hasSplashed ? 0.1 : 1.5
  const showSkeleton = heroImage.isLoading || !imageLoaded

  return (
    <section className="relative flex min-h-dvh w-full flex-col overflow-hidden bg-brand-500 lg:bg-white lg:flex-row">
      {/* 
        DESKTOP BACKGROUND LAYER 
        Keeps your perfect desktop diagonal logic.
      */}
      <div
        className="absolute inset-0 z-0 bg-brand-500 hidden lg:block"
        style={{ clipPath: 'polygon(58% 0, 100% 0, 100% 100%, 45% 100%)' }}
      />

      {/* 
        MOBILE BACKGROUND LAYER 
      */}
      <div
        className="absolute z-0 bg-white lg:hidden"
        style={{
          top: '-5%',
          left: '-10px',
          right: '-10px',
          height: '100%',
          clipPath: 'polygon(0 0, 100% 0, 100% 35%, 0 45%)',
          WebkitClipPath: 'polygon(0 0, 100% 0, 100% 35%, 0 45%)',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
        }}
      />

      {/* CONTENT WRAPPER */}
      <div className="relative z-10 flex flex-1 flex-col lg:flex-row">
        
        {/* LOGO SIDE (Top on Mobile | Right on Desktop) */}
        <div className="flex flex-1 items-center justify-center pt-20 pb-10 order-1 lg:order-2 lg:py-0">
          <div className="relative flex aspect-square w-[75%] max-w-[320px] items-center justify-center lg:w-[75%] lg:max-w-[550px] lg:ml-20">
            
            {/* SKELETON LOADER */}
            {showSkeleton && (
              <div className="absolute inset-0 z-20 flex items-center justify-center">
                {/* Pulsing circle that matches the logo shadow area */}
                <div className="h-full w-full animate-pulse rounded-full bg-black/5 dark:bg-white/5 backdrop-blur-sm" />
              </div>
            )}

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ 
                opacity: imageLoaded ? 1 : 0, 
                scale: imageLoaded ? 1 : 0.9 
              }}
              transition={{ duration: 1, delay: START_DELAY }}
              className="relative h-full w-full flex items-center justify-center"
            >
              <div className="absolute inset-0 rounded-full bg-black/5 blur-3xl" />
              <img
                src={heroImage.src}
                alt={heroImage.alt}
                onLoad={() => setImageLoaded(true)}
                className={cn(
                  "relative h-full w-full object-contain drop-shadow-[0_30px_50px_rgba(0,0,0,0.2)] lg:drop-shadow-[0_45px_70px_rgba(0,0,0,0.4)] transition-opacity duration-500",
                  !imageLoaded ? "opacity-0" : "opacity-100"
                )}
              />
            </motion.div>
          </div>
        </div>

        {/* TEXT SIDE (Bottom on Mobile | Left on Desktop) */}
        <div className="flex flex-1 flex-col justify-center px-6 pt-10 pb-16 text-center items-center order-2 lg:order-1 lg:text-left lg:items-start lg:pt-0 lg:pb-0 lg:pl-20 xl:pl-32">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: START_DELAY + 0.3, ease: 'easeOut' }}
            className="max-w-2xl flex flex-col items-center lg:items-start"
          >
            <h1 className="text-4xl font-black leading-tight tracking-tight text-white lg:text-ink sm:text-6xl lg:text-5xl xl:text-6xl">
              Your Safety, <br />
              <span className="text-white lg:text-brand-500">Our</span> Priority
            </h1>

            <div className="mt-4 h-1 w-16 bg-white lg:mt-6 lg:h-1.5 lg:w-16 lg:bg-brand-500 rounded-full" />

            <p className="mt-6 max-w-sm text-[15px] font-medium leading-relaxed text-white lg:text-neutral-500 lg:mt-8 lg:text-base lg:max-w-lg">
              We provide professional, reliable, and well-trained personnel to
              safeguard your people, property, and business in Zamboanga City
              since 2002.
            </p>

            <div className="mt-10 flex flex-col gap-3 w-full max-w-[200px] lg:flex-row lg:max-w-none lg:w-auto lg:gap-4">
              <ButtonLink
                to="/apply"
                className="w-full rounded-full lg:rounded-md bg-ink lg:w-[200px] lg:py-3.5 text-xs font-bold uppercase tracking-[0.2em] text-white transition-all hover:scale-105 hover:bg-neutral-800 active:scale-95 shadow-lg"
              >
                Join our team
              </ButtonLink>
              <ButtonLink
                to="/status"
                variant="secondary"
                className="w-full rounded-full lg:rounded-md border-2 border-white lg:border-ink bg-transparent lg:w-[200px] lg:py-3.5 text-xs font-bold uppercase tracking-[0.2em] text-white lg:text-ink transition-all hover:bg-white lg:hover:bg-ink hover:text-brand-600 lg:hover:text-white active:scale-95"
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