import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-[var(--app-bg)] px-6 text-center">
      <div className="rounded-full bg-[var(--app-surface)] p-4 text-brand-500 shadow-[var(--shadow-card)]">
        <Compass className="h-8 w-8" aria-hidden="true" />
      </div>

      <div>
        <p className="font-mono text-sm font-semibold text-brand-600">404</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--app-text)]">
          Page not found
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--app-text-muted)]">
          The page you're looking for doesn't exist, or it may have moved.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <Link to="/">
          <Button>Back to home</Button>
        </Link>
        <Link to="/status">
          <Button variant="secondary">Check application status</Button>
        </Link>
      </div>
    </div>
  )
}
