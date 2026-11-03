import { Link, Outlet } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { APP_NAME } from '@/lib/env'
import { useConsoleTheme } from '@/hooks/useConsoleTheme'

export function AuthLayout() {
  // Staff sign-in is the front door of the console, so it wears its palette.
  useConsoleTheme()

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* BRAND PANEL - NOW ON THE LEFT (Hidden on mobile) */}
      <div
        className="relative hidden flex-col justify-between overflow-hidden bg-brand-700 p-12 lg:flex"
        aria-hidden="true"
      >
       
        <div className="relative">
          <ShieldCheck className="h-10 w-10 text-white/90" />
          <h2 className="mt-6 max-w-md text-3xl leading-tight font-semibold text-white">
            Recruitment &amp; Deployment Management
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/70">
            A single operational record for every applicant, every guard and
            every post — from first application through deployment and end of
            duty.
          </p>
        </div>

        <dl className="relative grid grid-cols-3 gap-6 border-t border-white/10 pt-8">
          {[
            ['Vetted', 'Every applicant screened'],
            ['Tracked', 'Full deployment history'],
            ['Audited', 'Immutable change log'],
          ].map(([term, detail]) => (
            <div key={term}>
              <dt className="text-sm font-semibold text-white">{term}</dt>
              <dd className="mt-1 text-xs text-white/55">{detail}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* LOGIN PANEL - NOW ON THE RIGHT */}
      <div className="flex flex-col justify-center bg-[var(--app-surface)] px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/" className="inline-block">
            <Logo size="lg" />
          </Link>
          <div className="mt-10">
            <Outlet />
          </div>
          <p className="mt-10 text-xs text-[var(--app-text-subtle)]">
            This is an internal system for {APP_NAME} staff. Applicants do not
            need an account —{' '}
            <Link to="/apply" className="font-medium text-brand-600 underline">
              apply here
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  )
}