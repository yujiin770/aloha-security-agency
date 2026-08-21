import { Suspense, type ReactNode, useState, useEffect } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ToastProvider } from '@/components/ui/Toast'
import { OfflineBanner } from '@/components/OfflineBanner'
import { ErrorBoundary } from './ErrorBoundary'
import { EnvGate } from './EnvGate'
import { SplashScreen, LoadingState } from '@/components/ui/Feedback'
import { AnimatePresence } from 'framer-motion'

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
  const [showSplash, setShowSplash] = useState(true)

  useEffect(() => {
    // 3-second timer to hide the splash screen
    const timer = setTimeout(() => {
      setShowSplash(false)
    }, 2000)

    return () => clearTimeout(timer)
  }, [])

  return (
    <ErrorBoundary>
      <EnvGate>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <ToastProvider>
                <OfflineBanner />
                
                {/* 3-Second Branded Splash Gate */}
                <AnimatePresence>
                  {showSplash && <SplashScreen key="splash" />}
                </AnimatePresence>

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