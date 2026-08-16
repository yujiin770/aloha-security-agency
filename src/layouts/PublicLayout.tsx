import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Mail, MapPin, Menu, Phone, Search, X } from 'lucide-react'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Container } from '@/components/marketing'
import { useScrolled } from '@/hooks/useScrolled'
import { usePublicSettings } from '@/features/settings/hooks/useSettings'
import { cn } from '@/utils/cn'
import { APP_NAME, SUPPORT_EMAIL } from '@/lib/env'
import { BackToTop } from '@/components/BackToTop' 

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/services', label: 'Services' },
  { to: '/careers', label: 'Careers' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
]

/**
 * Public marketing shell.
 *
 * The `marketing` class pins the theme variables to their light values, so the
 * storefront stays white even when a visitor's OS — or their own admin theme
 * preference — is set to dark. See `styles/index.css`.
 */
export function PublicLayout() {
  const location = useLocation()
  const scrolled = useScrolled(24)

  // The menu records *which* route it was opened on rather than a plain
  // boolean. Navigating changes the pathname, so the menu closes itself — no
  // effect has to watch the location and call setState to catch up.
  const [openedOn, setOpenedOn] = useState<string | null>(null)
  const menuOpen = openedOn === location.pathname

  // Only the home page has a dark hero for the header to float over. Everywhere
  // else the header must be solid from the first frame or it sits invisibly on
  // white.
  const overHero = location.pathname === '/'
  const solid = true || scrolled || !overHero

  return (
    <div className="marketing flex min-h-dvh flex-col bg-white">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <SiteHeader
        solid={solid}
        overHero={overHero}
        menuOpen={menuOpen}
        onToggleMenu={() =>
          setOpenedOn((current) =>
            current === location.pathname ? null : location.pathname,
          )
        }
      />

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <SiteFooter />
      <BackToTop />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Header                                                                      */
/* -------------------------------------------------------------------------- */

function SiteHeader({
  solid,
  overHero,
  menuOpen,
  onToggleMenu,
}: {
  solid: boolean
  overHero: boolean
  menuOpen: boolean
  onToggleMenu: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Escape closes the mobile panel and returns focus to the trigger.
  useEffect(() => {
    if (!menuOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onToggleMenu()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen, onToggleMenu])

  // Lock background scroll while the full-height panel is open.
  useEffect(() => {
    if (!menuOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [menuOpen])

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        solid
          ? 'border-b border-[var(--app-border)] bg-white/95 backdrop-blur-md'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <Container>
        <div
          className={cn(
            'flex items-center justify-between gap-4 transition-all duration-300',
            solid ? 'h-16' : 'h-20',
          )}
        >
          <Link
            to="/"
            className="flex shrink-0 items-center gap-3"
            aria-label={`${APP_NAME} home`}
          >
            <img
              src="/logo.png"
              alt=""
              width={44}
              height={44}
              className={cn(
                'object-contain transition-all duration-300',
                solid ? 'h-9 w-9' : 'h-11 w-11',
              )}
            />
            <span className="hidden leading-tight sm:block">
              <span
                className={cn(
                  'block text-[15px] font-bold tracking-tight transition-colors',
                  solid || !overHero ? 'text-ink' : 'text-white',
                )}
              >
                {APP_NAME}
              </span>
              <span
                className={cn(
                  'block text-[10px] font-semibold tracking-[0.16em] uppercase transition-colors',
                  solid || !overHero ? 'text-brand-600' : 'text-brand-400',
                )}
              >
                Security Services
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'relative rounded-md px-3.5 py-2 text-sm font-medium transition-colors',
                    solid
                      ? isActive
                        ? 'text-brand-600'
                        : 'text-[var(--app-text-muted)] hover:text-ink'
                      : isActive
                        ? 'text-white'
                        : 'text-white/70 hover:text-white',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {item.label}
                    {isActive && (
                      <span
                        className="absolute inset-x-3.5 -bottom-0.5 h-0.5 rounded-full bg-brand-500"
                        aria-hidden="true"
                      />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ButtonLink
              to="/status"
              variant={solid ? 'ghost' : 'inverted'}
              size="md"
              leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
              className="max-lg:hidden lg:inline-flex"
            >
              Check status
            </ButtonLink>

            <ButtonLink
              to="/apply"
              size="md"
              className="max-lg:hidden lg:inline-flex"
            >
              Apply now
            </ButtonLink>

            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleMenu}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              className={cn(
                'lg:hidden',
                !solid && 'text-white hover:bg-white/10 hover:text-white',
              )}
            >
              {menuOpen ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
      </Container>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            ref={panelRef}
            id="mobile-nav"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="border-t border-[var(--app-border)] bg-white lg:hidden"
          >
            <Container>
              <nav className="py-4" aria-label="Mobile">
                {NAV.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        'block rounded-lg px-4 py-3 text-base font-medium transition-colors',
                        isActive
                          ? 'bg-brand-50 text-brand-700'
                          : 'text-[var(--app-text)] hover:bg-canvas',
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}

                <div className="mt-4 grid gap-2 border-t border-[var(--app-border)] pt-4">
                  <ButtonLink to="/apply" size="lg" fullWidth>
                    Apply now
                  </ButtonLink>
                  <ButtonLink
                    to="/status"
                    variant="secondary"
                    size="lg"
                    fullWidth
                    leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
                  >
                    Check application status
                  </ButtonLink>
                </div>
              </nav>
            </Container>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}

/* -------------------------------------------------------------------------- */
/* Footer                                                                      */
/* -------------------------------------------------------------------------- */

function SiteFooter() {
  const { data: settings } = usePublicSettings()

  const email = String(settings?.['company.email'] ?? SUPPORT_EMAIL)
  const phone = String(settings?.['company.phone'] ?? '+63 900 000 0000')
  const address = String(settings?.['company.address'] ?? 'Philippines')

  return (
    <footer className="bg-ink text-neutral-400">
      <div className="bg-command-stripe h-1" aria-hidden="true" />

      <Container className="py-16 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Link to="/" className="flex items-center gap-3">
              <img
                src="/logo.png"
                alt=""
                width={52}
                height={52}
                loading="lazy"
                className="h-12 w-12 object-contain"
              />
              <span className="leading-tight">
                <span className="block text-base font-bold tracking-tight text-white">
                  {APP_NAME}
                </span>
                <span className="block text-[10px] font-semibold tracking-[0.16em] text-brand-400 uppercase">
                  Security Services
                </span>
              </span>
            </Link>

            <p className="mt-6 max-w-sm text-sm leading-relaxed">
              Licensed private security services across the Philippines.
              Professionally trained, thoroughly vetted, and deployed with
              accountability.
            </p>

            <ul className="mt-6 space-y-3 text-sm">
              <li>
                <a
                  href={`mailto:${email}`}
                  className="inline-flex items-center gap-2.5 hover:text-white"
                >
                  <Mail className="h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
                  {email}
                </a>
              </li>
              <li>
                <a
                  href={`tel:${phone.replace(/\s/g, '')}`}
                  className="inline-flex items-center gap-2.5 hover:text-white"
                >
                  <Phone className="h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
                  {phone}
                </a>
              </li>
              <li className="inline-flex items-center gap-2.5">
                <MapPin className="h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
                {address}
              </li>
            </ul>
          </div>

          <div className="grid gap-10 sm:grid-cols-3 lg:col-span-7">
            <FooterColumn
              heading="Company"
              links={[
                { to: '/services', label: 'Services' },
                { to: '/about', label: 'About us' },
                { to: '/careers', label: 'Careers' },
                { to: '/contact', label: 'Contact' },
              ]}
            />
            <FooterColumn
              heading="Applicants"
              links={[
                { to: '/apply', label: 'Apply online' },
                { to: '/status', label: 'Check your status' },
                { to: '/careers', label: 'Requirements' },
              ]}
            />
            <div>
              <h2 className="text-xs font-semibold tracking-[0.16em] text-white uppercase">
                Clients
              </h2>
              <p className="mt-4 text-sm leading-relaxed">
                Need security personnel for your site? Tell us about the post and
                we'll scope the detachment with you.
              </p>
              <ButtonLink
                to="/contact"
                size="sm"
                variant="inverted"
                className="mt-4"
                rightIcon={<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
              >
                Request a quote
              </ButtonLink>
            </div>
          </div>
        </div>
      </Container>

      <div className="border-t border-neutral-800">
        <Container>
          <div className="flex flex-wrap items-center justify-between gap-3 py-6 text-xs">
            <p>
              © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
            </p>
            <div className="flex items-center gap-5">
              <span>Licensed &amp; SOSIA compliant</span>
              <Link to="/auth/login" className="hover:text-white">
                Staff sign in
              </Link>
            </div>
          </div>
        </Container>
      </div>
    </footer>
  )
}

function FooterColumn({
  heading,
  links,
}: {
  heading: string
  links: { to: string; label: string }[]
}) {
  return (
    <div>
      <h2 className="text-xs font-semibold tracking-[0.16em] text-white uppercase">
        {heading}
      </h2>
      <ul className="mt-4 space-y-3 text-sm">
        {links.map((link) => (
          <li key={`${link.to}-${link.label}`}>
            <Link to={link.to} className="hover:text-white">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
