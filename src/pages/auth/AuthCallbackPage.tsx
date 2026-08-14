import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useLinkSession } from '@/features/auth/useLinkSession'

/**
 * Landing page for magic links and email invitations.
 *
 * The Supabase client is configured with `detectSessionInUrl`, but that
 * exchange is asynchronous — see `useLinkSession`, which is what actually waits
 * for it. All this page does is route onward once a session exists.
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const link = useLinkSession()

  useEffect(() => {
    if (link.state !== 'ready') return
    // An invited user arrives with no password set; send them to choose one.
    navigate(link.isInvite ? '/auth/reset-password' : '/admin', { replace: true })
  }, [link.state, link.isInvite, navigate])

  if (link.state === 'failed') {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--app-text)]">
          That link didn't work
        </h1>
        <p className="mt-1.5 text-sm text-[var(--app-text-muted)]">
          Sign-in links expire after an hour and can only be used once. They also
          have to be opened in the same browser that requested them. Request a
          fresh one and try again.
        </p>
        {link.error && (
          <p className="mt-3 rounded-lg bg-[var(--app-bg)] p-3 text-xs text-[var(--app-text-muted)]">
            {link.error}
          </p>
        )}
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
