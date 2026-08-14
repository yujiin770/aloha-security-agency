import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/queryClient'
import { fetchSessionUser, signOut as apiSignOut, type SessionUser } from '@/features/auth/api/authApi'
import { markDeliberateSignOut } from '@/features/auth/signOutIntent'
import { ADMIN_ROLES } from '@/utils/constants'
import type { AppRole } from '@/types/database.types'

/**
 * Session state for the whole app.
 *
 * Checks exposed here (`hasRole`, `hasPermission`, `isAdmin`) drive navigation
 * and button visibility only. They are a usability affordance, never a security
 * boundary: Row Level Security decides what the database will actually return,
 * and this context is trivially editable in a debugger.
 *
 * `hasPermission` answers "may this user open that page"; `hasRole` answers
 * "does this user hold privileges equivalent to that built-in role". Hiding a
 * page does not hide the data behind it, and was never meant to.
 */

interface AuthContextValue {
  session: Session | null
  user: SessionUser | null
  /** Built-in roles, resolved through custom roles' inheritance. */
  roles: AppRole[]
  /** Role keys exactly as granted, custom roles included. */
  roleKeys: string[]
  permissions: string[]
  isLoading: boolean
  /** True when authenticated but with no active profile or role grant. */
  isUnprovisioned: boolean
  hasRole: (...roles: AppRole[]) => boolean
  /** Page access, e.g. `hasPermission('pages.applicants')`. */
  hasPermission: (...keys: string[]) => boolean
  isAdmin: boolean
  isStaff: boolean
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [isSessionLoading, setIsSessionLoading] = useState(true)
  // Separate from the session load: `onAuthStateChange` hands us a session
  // synchronously but the profile — and therefore `permissions` — arrives a
  // round trip later. Without this flag `isLoading` was already false during
  // that window, so <PageGuard> tested an empty permission list and rendered
  // "You don't have access to this page" to an owner mid-sign-in.
  const [isProfileLoading, setIsProfileLoading] = useState(false)
  const [isUnprovisioned, setIsUnprovisioned] = useState(false)

  // Guards against a slow profile fetch resolving after the user has signed
  // out, which would otherwise repopulate state for a dead session.
  const activeUserId = useRef<string | null>(null)

  const loadUser = useCallback(async (nextSession: Session | null) => {
    const authUser = nextSession?.user
    activeUserId.current = authUser?.id ?? null

    if (!authUser) {
      setUser(null)
      setIsUnprovisioned(false)
      setIsProfileLoading(false)
      return
    }

    // Set synchronously, before the first await, so the guards never observe a
    // gap between "signed in" and "profile loading".
    setIsProfileLoading(true)

    try {
      const sessionUser = await fetchSessionUser(authUser.id, authUser.email ?? '')
      if (activeUserId.current !== authUser.id) return
      setUser(sessionUser)
      setIsUnprovisioned(sessionUser === null)
    } catch {
      if (activeUserId.current !== authUser.id) return
      setUser(null)
      setIsUnprovisioned(true)
    } finally {
      if (activeUserId.current === authUser.id) setIsProfileLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (cancelled) return
        setSession(data.session)
        await loadUser(data.session)
      })
      .finally(() => {
        if (!cancelled) setIsSessionLoading(false)
      })

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        setSession(nextSession)

        // TOKEN_REFRESHED fires roughly hourly and carries the same identity;
        // refetching the profile on it would be pure churn.
        if (event === 'TOKEN_REFRESHED') return

        if (event === 'SIGNED_OUT') {
          activeUserId.current = null
          setUser(null)
          setIsUnprovisioned(false)
          setIsProfileLoading(false)
          queryClient.clear()
          return
        }

        void loadUser(nextSession)
      },
    )

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [loadUser])

  const signOut = useCallback(async () => {
    // Records that this sign-out was deliberate. <ProtectedRoute> remembers the
    // page a bounced-out user was heading for so login can return them to it,
    // which is right for an expired session but wrong here: someone who signs
    // out on Applicants and back in expects the Dashboard, not Applicants.
    // LoginPage reads and clears this.
    markDeliberateSignOut()
    await apiSignOut()
    queryClient.clear()
  }, [])

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    setSession(data.session)
    await loadUser(data.session)
  }, [loadUser])

  // A signed-in user whose profile is still in flight counts as loading: the
  // role and permission lists are not yet trustworthy, and every guard below
  // reads them.
  const isLoading = isSessionLoading || isProfileLoading

  const value = useMemo<AuthContextValue>(() => {
    const roles = user?.roles ?? []
    const roleKeys = user?.roleKeys ?? []
    const permissions = user?.permissions ?? []
    return {
      session,
      user,
      roles,
      roleKeys,
      permissions,
      isLoading,
      isUnprovisioned,
      hasRole: (...check: AppRole[]) => check.some((r) => roles.includes(r)),
      hasPermission: (...keys: string[]) => keys.some((k) => permissions.includes(k)),
      // Mirrors SQL `is_admin()` and `ADMIN_ROLES`; system_administrator was
      // omitted here and nowhere else, which made the two disagree.
      isAdmin: ADMIN_ROLES.some((r) => roles.includes(r)),
      isStaff: roles.length > 0,
      signOut,
      refresh,
    }
  }, [session, user, isLoading, isUnprovisioned, signOut, refresh])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
