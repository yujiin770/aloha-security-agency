import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'

/**
 * Landing page for magic links and email invitations.
 *
 * The Supabase client is configured with `detectSessionInUrl`, so by the time
 * this mounts the token in the URL has already been exchanged for a session.
 * All this page does is wait for that and route onward.
 */
/**
 * The provider hands back its outcome in the URL fragment. Reading it during
 * render rather than in an effect means an error link never causes a render
 * with the spinner followed immediately by a state update.
 */
function readHashParams(): URLSearchParams {
  return new URLSearchParams(window.location.hash.replace(/^#/, ''))
}

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const [hashParams] = useState(readHashParams)
  const [sessionMissing, setSessionMissing] = useState(false)

  const failed = hashParams.get('error') !== null || sessionMissing

  useEffect(() => {
    if (hashParams.get('error')) return

    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      if (data.session) {
        // An invited user arrives with no password set; send them to choose one.
        const isInvite = hashParams.get('type') === 'invite'
        navigate(isInvite ? '/auth/reset-password' : '/admin', { replace: true })
      } else {
        setSessionMissing(true)
      }
    })

    return () => {
      cancelled = true
    }
  }, [navigate, hashParams])

  if (failed) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--app-text)]">
          That link didn't work
        </h1>
        <p className="mt-1.5 text-sm text-[var(--app-text-muted)]">
          Sign-in links expire after an hour and can only be used once. Request a
          fresh one and try again.
        </p>
        <Link to="/auth/login" className="mt-6 inline-block">
          <Button>Back to sign in</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 text-[var(--app-text-muted)]" role="status">
      <Loader2 className="h-5 w-5 animate-spin text-brand-500" aria-hidden="true" />
      <p className="text-sm">Signing you in…</p>
    </div>
  )
}
