import { supabase } from '@/lib/supabase'
import { toAppError, AppError } from '@/lib/errors'
import { env } from '@/lib/env'
import type { ProfileRow } from '@/types/database.types'

export interface StaffUser extends ProfileRow {
  roles: string[]
}

/**
 * `user_roles` points at `profiles` twice — `user_id` and `granted_by` — so a
 * bare `user_roles(role)` embed is ambiguous and PostgREST refuses it. The
 * `!user_roles_user_id_fkey` hint names the relationship we mean: the roles
 * held by this profile, not the ones it handed out.
 */
export async function listUsers(includeInactive = true): Promise<StaffUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, user_roles!user_roles_user_id_fkey(role)')
    .order('full_name')

  if (error) throw toAppError(error, 'Could not load users.')

  const rows = (data ?? []) as unknown as (ProfileRow & {
    user_roles: { role: string }[] | null
  })[]

  return rows
    .filter((row) => includeInactive || row.is_active)
    .map(({ user_roles, ...profile }) => ({
      ...profile,
      roles: (user_roles ?? []).map((r) => r.role),
    }))
}

export async function getStaffUser(id: string): Promise<StaffUser> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, user_roles!user_roles_user_id_fkey(role)')
    .eq('id', id)
    .single()

  if (error) throw toAppError(error, 'Could not load that user.')

  const row = data as unknown as ProfileRow & {
    user_roles: { role: string }[] | null
  }
  const { user_roles, ...profile } = row

  return { ...profile, roles: (user_roles ?? []).map((r) => r.role) }
}

/**
 * Creates a staff member, already confirmed and ready to sign in.
 *
 * No invitation email is sent: the Edge Function creates the account with the
 * password given here and marks the address confirmed, so the admin can hand
 * over the credentials directly.
 *
 * Creating an auth user needs the service_role key, which must never reach the
 * browser — so this delegates to the `admin-create-user` Edge Function, passing
 * the caller's own JWT so the function can verify they are an owner or admin.
 */
export async function createStaffUser(input: {
  email: string
  full_name: string
  password: string
  role: string
  phone?: string
}): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) throw new AppError('Your session has expired. Please sign in again.')

  const response = await fetch(
    `${env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: env.VITE_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  )

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new AppError(
      body.error ??
        (response.status === 404
          ? 'The admin-create-user function is not deployed yet. Run: supabase functions deploy admin-create-user'
          : 'Could not create that user.'),
      String(response.status),
    )
  }
}

export async function assignRole(userId: string, role: string): Promise<void> {
  const { error } = await supabase
    .from('user_roles')
    .insert({ user_id: userId, role, granted_by: null })

  if (error) throw toAppError(error, 'Could not assign that role.')
}

export async function revokeRole(userId: string, role: string): Promise<void> {
  const { error } = await supabase
    .from('user_roles')
    .delete()
    .eq('user_id', userId)
    .eq('role', role)

  if (error) throw toAppError(error, 'Could not revoke that role.')
}

/**
 * Deactivation rather than deletion: `is_active` is checked by every RLS helper
 * (0007), so flipping it revokes access immediately while preserving the audit
 * trail that references this user.
 */
export async function setUserActive(userId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', userId)

  if (error) throw toAppError(error, 'Could not update that user.')
}

export async function updateUserProfile(
  userId: string,
  patch: Partial<Pick<ProfileRow, 'full_name' | 'phone' | 'job_title' | 'branch_id'>>,
): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
  if (error) throw toAppError(error, 'Could not save that user.')
}
