import { QueryClient } from '@tanstack/react-query'
import { toAppError } from './errors'

/**
 * Shared TanStack Query configuration.
 *
 * Defaults are tuned for an internal dashboard: data is not so volatile that
 * every focus change should refetch, but stale-while-revalidate keeps tables
 * feeling live. Authorisation failures are never retried — RLS said no, and it
 * will keep saying no.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        const code = toAppError(error).code
        if (code && ['42501', 'PGRST301', 'PGRST116', '23505'].includes(code)) {
          return false
        }
        return failureCount < 2
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8_000),
    },
    mutations: {
      // A failed write must surface, not silently replay against a server that
      // may have partially applied it.
      retry: false,
    },
  },
})
