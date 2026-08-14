import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ShieldAlert, ShieldX } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { LoadingState } from '@/components/ui/Feedback'
import { Button } from '@/components/ui/Button'
import { pageLabel } from '@/utils/pages'
import type { AppRole } from '@/types/database.types'

/**
 * Route guards.
 *
 * These control what is *rendered*, not what is *readable*. A user who edits
 * their way past a guard reaches a page whose every query still comes back
 * empty or 403 — RLS is the actual boundary. Guards exist so people don't see
 * dead ends they can't use.
 */

export function ProtectedRoute() {
  const { session, isLoading, isUnprovisioned, signOut } = useAuth()
  const location = useLocation()

  if (isLoading) return <LoadingState label="Checking your session…" />

  if (!session) {
    // Remember where they were headed so login can send them back.
    return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />
  }

  if (isUnprovisioned) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="rounded-full bg-warning-soft p-3 text-warning">
          <ShieldAlert className="h-7 w-7" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-[var(--app-text)]">
            Your account is not yet active
          </h1>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--app-text-muted)]">
            Your sign-in worked, but no role has been assigned to this account —
            or it has been deactivated. Ask an administrator to grant you access.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    )
  }

  return <Outlet />
}

export interface RoleGuardProps {
  allow: AppRole[]
  children?: ReactNode
  /** Render nothing instead of the denial screen — for inline UI affordances. */
  silent?: boolean
}

export function RoleGuard({ allow, children, silent }: RoleGuardProps) {
  const { hasRole, isLoading } = useAuth()

  if (isLoading) return silent ? null : <LoadingState />

  if (!hasRole(...allow)) {
    if (silent) return null
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="rounded-full bg-danger-soft p-3 text-danger">
          <ShieldX className="h-7 w-7" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-[var(--app-text)]">
            You don't have access to this page
          </h1>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--app-text-muted)]">
            This area is limited to:{' '}
            {allow.map((r) => r.replace(/_/g, ' ')).join(', ')}.
          </p>
        </div>
      </div>
    )
  }

  return <>{children ?? <Outlet />}</>
}

/** Renders children only when the user holds one of the roles. */
export function Can({ roles, children }: { roles: AppRole[]; children: ReactNode }) {
  const { hasRole } = useAuth()
  return hasRole(...roles) ? <>{children}</> : null
}

/**
 * Admits a route only if the user's roles grant its page permission.
 *
 * The counterpart to the sidebar's filter: without this, a page hidden from the
 * navigation is still reachable by typing its address, which is a weaker
 * promise than the Roles screen appears to make.
 */
export function PageGuard({
  permission,
  children,
}: {
  permission: string
  children?: ReactNode
}) {
  const { hasPermission, isLoading } = useAuth()

  if (isLoading) return <LoadingState />

  if (!hasPermission(permission)) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="rounded-full bg-danger-soft p-3 text-danger">
          <ShieldX className="h-7 w-7" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-[var(--app-text)]">
            You don't have access to this page
          </h1>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--app-text-muted)]">
            {pageLabel(permission)} is not included in your role. An
            administrator can grant it from Data Configuration → Roles.
          </p>
        </div>
      </div>
    )
  }

  return <>{children ?? <Outlet />}</>
}
