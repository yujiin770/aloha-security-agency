import { Suspense, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ToastProvider } from '@/components/ui/Toast'
import { LoadingState } from '@/components/ui/Feedback'
import { OfflineBanner } from '@/components/OfflineBanner'
import { ErrorBoundary } from './ErrorBoundary'
import { EnvGate } from './EnvGate'

/**
 * Provider stack, outermost first.
 *
 * Order is deliberate:
 *   ErrorBoundary  — must survive a crash in anything below it
 *   EnvGate        — short-circuits before any provider tries to reach Supabase
 *   Theme          — sets the `.dark` class before first paint
 *   QueryClient    — AuthProvider clears its cache on sign-out
 *   Auth           — everything below can call useAuth()
 *   Toast          — available to every page, and to the offline banner, which
 *                    toasts on reconnect
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <EnvGate>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <ToastProvider>
                <OfflineBanner />
                <Suspense fallback={<LoadingState label="Loading…" />}>
                  {children}
                </Suspense>
              </ToastProvider>
            </AuthProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </EnvGate>
    </ErrorBoundary>
  )
}
