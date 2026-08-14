import { supabase } from '@/lib/supabase'
import { toAppError } from '@/lib/errors'
import type { AppRole, ProfileRow } from '@/types/database.types'

/**
 * Auth repository.
 *
 * The only module in the app allowed to touch `supabase.auth` directly.
 * Everything here throws `AppError` on failure so callers get one error shape.
 */

export interface SessionUser {
  id: string
  email: string
  profile: ProfileRow
  /** Role keys as granted — includes custom roles created from the UI. */
  roleKeys: string[]
  /**
   * The built-in roles those grants resolve to, via `roles.inherits_from`.
   * This is what `hasRole()` tests, so a custom role behaves in the interface
   * exactly as it behaves in RLS.
   */
  roles: AppRole[]
  /** Page permission keys (`pages.applicants`, …) across all roles held. */
  permissions: string[]
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw toAppError(error, 'Could not sign you in.')
  return data
}

export async function signInWithMagicLink(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
      // This is an internal system: a magic link must never create an account.
      shouldCreateUser: false,
    },
  })
  if (error) throw toAppError(error, 'Could not send the sign-in link.')
}

export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  })
  if (error) throw toAppError(error, 'Could not send the reset email.')
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw toAppError(error, 'Could not update your password.')
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw toAppError(error, 'Could not sign you out.')
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw toAppError(error)
  return data.session
}

/**
 * Loads the profile, role grants and page permissions for a signed-in user.
 *
 * Returns null when the account exists in auth but has been deactivated or
 * never granted a role — those users must not reach the dashboard.
 *
 * Roles are read with their `inherits_from` joined in so a custom role resolves
 * to the built-in it borrows its database privileges from. Without that, the
 * interface would hide affordances the database would in fact allow.
 */
export async function fetchSessionUser(
  userId: string,
  email: string,
): Promise<SessionUser | null> {
  const [
    { data: profile, error: profileError },
    { data: roleRows, error: roleError },
    { data: roleDefs, error: roleDefError },
    { data: permissionRows, error: permissionError },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', userId),
    supabase.from('roles').select('key, inherits_from'),
    supabase.rpc('my_permissions'),
  ])

  if (profileError) throw toAppError(profileError, 'Could not load your profile.')
  if (roleError) throw toAppError(roleError, 'Could not load your permissions.')
  if (roleDefError) throw toAppError(roleDefError, 'Could not load your permissions.')
  if (permissionError) {
    throw toAppError(permissionError, 'Could not load your permissions.')
  }
  if (!profile || !profile.is_active) return null

  const roleKeys = (roleRows ?? []).map((r) => r.role)
  if (roleKeys.length === 0) return null

  const inheritance = new Map(
    (roleDefs ?? []).map((r) => [r.key, r.inherits_from] as const),
  )
  const roles = [
    ...new Set(
      roleKeys
        .map((key) => inheritance.get(key) ?? (key as AppRole))
        .filter((r): r is AppRole => Boolean(r)),
    ),
  ]

  const permissions = (permissionRows ?? []) as string[]

  return { id: userId, email, profile, roleKeys, roles, permissions }
}

export async function updateOwnProfile(
  userId: string,
  patch: Partial<Pick<ProfileRow, 'full_name' | 'phone' | 'job_title'>>,
) {
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select()
    .single()

  if (error) throw toAppError(error, 'Could not save your profile.')
  return data
}
