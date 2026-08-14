import type { ReactNode } from 'react'
import { AlertTriangle, ExternalLink, Terminal } from 'lucide-react'
import { envErrors, isConfigured } from '@/lib/env'

/**
 * Boot gate.
 *
 * Without Supabase credentials the app cannot do anything useful, and every
 * query would fail with an opaque network error. Rather than render a broken
 * shell, show the person exactly what is missing and how to fix it.
 */
export function EnvGate({ children }: { children: ReactNode }) {
  if (isConfigured) return <>{children}</>

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <main className="w-full max-w-2xl rounded-[var(--radius-card)] border border-[var(--app-border)] bg-white shadow-[var(--shadow-card)]">
        <div className="flex items-start gap-4 border-b border-[var(--app-border)] p-6">
          <div className="rounded-full bg-warning-soft p-2.5 text-warning">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-ink">Supabase is not configured</h1>
            <p className="mt-1 text-sm text-neutral-600">
              The app is running, but it has no backend to talk to yet. Set the
              two environment variables below and restart the dev server.
            </p>
          </div>
        </div>

        <div className="space-y-5 p-6">
          <section>
            <h2 className="text-sm font-semibold text-ink">What's missing</h2>
            <ul className="mt-2 space-y-1">
              {envErrors.map((message) => (
                <li
                  key={message}
                  className="rounded border border-danger/20 bg-danger-soft px-3 py-2 font-mono text-xs text-danger"
                >
                  {message}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-ink">How to fix it</h2>
            <ol className="mt-2 list-inside list-decimal space-y-2 text-sm text-neutral-700">
              <li>
                Create a project at{' '}
                <a
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 font-medium text-brand-600 underline"
                >
                  supabase.com/dashboard
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </li>
              <li>
                Copy <code className="font-mono text-xs">.env.example</code> to{' '}
                <code className="font-mono text-xs">.env</code>
              </li>
              <li>
                Paste the Project URL and <em>anon</em> key from{' '}
                <span className="font-medium">Project Settings → API</span>
              </li>
              <li>
                Apply the schema:{' '}
                <code className="font-mono text-xs">supabase db push</code>
              </li>
              <li>Restart the dev server</li>
            </ol>
          </section>

          <section className="rounded-lg bg-ink p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-neutral-400">
              <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
              .env
            </div>
            <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-neutral-200">
              {`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...`}
            </pre>
          </section>

          <p className="text-xs text-neutral-500">
            Never put the <code className="font-mono">service_role</code> key in
            this file — anything prefixed <code className="font-mono">VITE_</code>{' '}
            is compiled into the browser bundle and is public.
          </p>
        </div>
      </main>
    </div>
  )
}
