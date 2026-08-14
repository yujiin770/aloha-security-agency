import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Waits for the session an email link carries in its URL.
 *
 * `detectSessionInUrl` does the exchange, but it does it *asynchronously* — and
 * under `flowType: 'pkce'` that exchange is a network round trip to
 * `/auth/v1/token`, not a synchronous parse of the URL fragment. A bare
 * `getSession()` on mount therefore resolves to `null` most of the time, which
 * is why a perfectly valid magic link or password-reset link rendered "that
 * link didn't work".
 *
 * So: subscribe first, poll `getSession` as a backstop for the case where the
 * exchange completed before this component mounted, and only conclude failure
 * once the provider reports an error or the grace period expires.
 */

export type LinkSessionState = 'pending' | 'ready' | 'failed'

export interface LinkSession {
  state: LinkSessionState
  /** The provider's own explanation, when it sent one. */
  error: string | null
  /** True for an invite link, which must land on "choose a password". */
  isInvite: boolean
  isRecovery: boolean
}

/**
 * The provider reports outcomes in the fragment for the implicit flow and in
 * the query string for PKCE. Reading only one of them is how an expired link
 * ends up looking like a hung spinner.
 */
function readLinkParams(): URLSearchParams {
  const merged = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  hash.forEach((value, key) => merged.set(key, value))
  return merged
}

export function useLinkSession(timeoutMs = 10_000): LinkSession {
  const [params] = useState(readLinkParams)

  const providerError =
    params.get('error_description') ?? params.get('error') ?? null
  const type = params.get('type')

  // An explicit error in the URL is final — there is nothing to wait for, so
  // this starts settled rather than flashing a spinner first.
  const [state, setState] = useState<LinkSessionState>(
    providerError ? 'failed' : 'pending',
  )

  useEffect(() => {
    if (providerError) return

    let settled = false

    function succeed() {
      if (settled) return
      settled = true
      setState('ready')
    }

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) succeed()
      },
    )

    // Covers the exchange having finished before this effect ran, in which case
    // no further auth event will fire.
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) succeed()
    })

    const timer = window.setTimeout(() => {
      if (settled) return
      settled = true
      setState('failed')
    }, timeoutMs)

    return () => {
      settled = true
      window.clearTimeout(timer)
      subscription.subscription.unsubscribe()
    }
  }, [providerError, timeoutMs])

  return {
    state,
    error: providerError,
    isInvite: type === 'invite',
    isRecovery: type === 'recovery',
  }
}
