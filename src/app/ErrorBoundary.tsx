import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertOctagon } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Top-level crash handler.
 *
 * The stack trace is shown only in development. In production it is logged to
 * the console and withheld from the page — a stack can disclose file paths and
 * internal structure to anyone looking over the operator's shoulder.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-[var(--app-bg)] p-6 text-center">
        <div className="rounded-full bg-danger-soft p-3 text-danger">
          <AlertOctagon className="h-8 w-8" aria-hidden="true" />
        </div>

        <div>
          <h1 className="text-xl font-semibold text-[var(--app-text)]">
            Something broke
          </h1>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--app-text-muted)]">
            An unexpected error stopped this page from rendering. Reloading
            usually clears it. If it keeps happening, report it with what you
            were doing at the time.
          </p>
        </div>

        {import.meta.env.DEV && (
          <pre className="scrollbar-slim max-h-48 max-w-2xl overflow-auto rounded-lg bg-ink p-4 text-left font-mono text-xs text-neutral-300">
            {error.stack ?? error.message}
          </pre>
        )}

        <div className="flex gap-2">
          <Button onClick={() => window.location.reload()}>Reload the page</Button>
          <Button variant="secondary" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
        </div>
      </div>
    )
  }
}
