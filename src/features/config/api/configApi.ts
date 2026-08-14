import { supabase } from '@/lib/supabase'
import { toAppError } from '@/lib/errors'
import type {
  AppRole,
  PermissionRow,
  PositionRow,
  RankRow,
  RoleRow,
} from '@/types/database.types'

/**
 * Configuration repository — positions and ranks.
 *
 * These were a PostgreSQL enum and a free-text column until migration 0013.
 * They are now ordinary rows, so a system administrator can add a post type or
 * a rank without a developer writing a migration.
 */

/* -------------------------------------------------------------------------- */
/* Positions                                                                   */
/* -------------------------------------------------------------------------- */

export async function listPositions(includeInactive = false): Promise<PositionRow[]> {
  let query = supabase
    .from('positions')
    .select('*')
    .order('sort_order')
    .order('name')

  if (!includeInactive) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) throw toAppError(error, 'Could not load positions.')
  return data ?? []
}

/**
 * Positions offered on the public application form.
 *
 * Readable by the anonymous role — the RLS policy in 0014 restricts anon to
 * rows that are both active and public, so this is the same information a
 * recruitment poster would carry.
 */
export async function listPublicPositions(): Promise<PositionRow[]> {
  const { data, error } = await supabase
    .from('positions')
    .select('*')
    .eq('is_active', true)
    .eq('is_public', true)
    .order('sort_order')

  if (error) throw toAppError(error, 'Could not load open positions.')
  return data ?? []
}

export type PositionInput = Omit<
  PositionRow,
  'id' | 'created_at' | 'updated_at' | 'created_by'
>

export async function createPosition(input: PositionInput): Promise<PositionRow> {
  const { data, error } = await supabase
    .from('positions')
    .insert({ ...input, created_by: null })
    .select()
    .single()

  if (error) throw toAppError(error, 'Could not create that position.')
  return data
}

export async function updatePosition(
  id: string,
  patch: Partial<PositionInput>,
): Promise<PositionRow> {
  const { data, error } = await supabase
    .from('positions')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw toAppError(error, 'Could not save that position.')
  return data
}

/**
 * Deletes a position.
 *
 * `applicants.position_id` and `personnel.position_id` are `ON DELETE RESTRICT`,
 * so this fails once the position is in use — which is correct. Deactivating is
 * the right move for a position with history; `errors.ts` turns the foreign-key
 * violation into that advice.
 */
export async function deletePosition(id: string): Promise<void> {
  const { error } = await supabase.from('positions').delete().eq('id', id)
  if (error) throw toAppError(error, 'Could not delete that position.')
}

/* -------------------------------------------------------------------------- */
/* Ranks                                                                       */
/* -------------------------------------------------------------------------- */

export async function listRanks(includeInactive = false): Promise<RankRow[]> {
  let query = supabase.from('ranks').select('*').order('level').order('sort_order')
  if (!includeInactive) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) throw toAppError(error, 'Could not load ranks.')
  return data ?? []
}

/** Ranks offered for one position, honouring the position_ranks mapping. */
export async function listRanksForPosition(positionId: string): Promise<RankRow[]> {
  const { data, error } = await supabase.rpc('ranks_for_position', {
    p_position_id: positionId,
  })

  if (error) throw toAppError(error, 'Could not load ranks for that position.')
  return data ?? []
}

export type RankInput = Omit<RankRow, 'id' | 'created_at' | 'updated_at' | 'created_by'>

export async function createRank(input: RankInput): Promise<RankRow> {
  const { data, error } = await supabase
    .from('ranks')
    .insert({ ...input, created_by: null })
    .select()
    .single()

  if (error) throw toAppError(error, 'Could not create that rank.')
  return data
}

export async function updateRank(
  id: string,
  patch: Partial<RankInput>,
): Promise<RankRow> {
  const { data, error } = await supabase
    .from('ranks')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw toAppError(error, 'Could not save that rank.')
  return data
}

export async function deleteRank(id: string): Promise<void> {
  const { error } = await supabase.from('ranks').delete().eq('id', id)
  if (error) throw toAppError(error, 'Could not delete that rank.')
}

/* -------------------------------------------------------------------------- */
/* Roles and permissions                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Role definitions.
 *
 * Since 0020 `roles.key` is plain text, so roles can be created and deleted
 * here. What a new role can *do* in the database comes from `inherits_from`:
 * RLS is written against the seven built-in roles, and a custom role carries
 * the privileges of whichever one it names. Its page access is separate, and
 * freely configurable through `role_permissions`.
 */
export async function listRoles(): Promise<RoleRow[]> {
  const { data, error } = await supabase.from('roles').select('*').order('rank')
  if (error) throw toAppError(error, 'Could not load roles.')
  return data ?? []
}

export type RoleInput = Pick<
  RoleRow,
  'label' | 'description' | 'rank' | 'is_assignable'
> & { inherits_from?: AppRole | null }

export async function createRole(
  input: RoleInput & { key: string },
): Promise<RoleRow> {
  const { data, error } = await supabase
    .from('roles')
    .insert({ ...input, is_system: false })
    .select()
    .single()

  if (error) throw toAppError(error, 'Could not create that role.')
  return data
}

/**
 * Deletion is refused by the database (FK `on delete restrict`) while anyone
 * still holds the role, rather than silently stripping their access.
 */
export async function deleteRole(key: string): Promise<void> {
  const { error } = await supabase.from('roles').delete().eq('key', key)
  if (error) throw toAppError(error, 'Could not delete that role.')
}

export async function updateRole(
  key: string,
  patch: Partial<RoleInput>,
): Promise<RoleRow> {
  const { data, error } = await supabase
    .from('roles')
    .update(patch)
    .eq('key', key)
    .select()
    .single()

  if (error) throw toAppError(error, 'Could not save that role.')
  return data
}

export async function listPermissions(): Promise<PermissionRow[]> {
  const { data, error } = await supabase
    .from('permissions')
    .select('*')
    .order('resource')
    .order('action')

  if (error) throw toAppError(error, 'Could not load permissions.')
  return data ?? []
}

/** Every role→permission grant, as a map of role key to permission keys. */
export async function listRolePermissions(): Promise<Record<string, string[]>> {
  const { data, error } = await supabase
    .from('role_permissions')
    .select('role_key, permission_key')

  if (error) throw toAppError(error, 'Could not load role permissions.')

  const map: Record<string, string[]> = {}
  for (const row of data ?? []) {
    ;(map[row.role_key] ??= []).push(row.permission_key)
  }
  return map
}

export async function grantPermission(
  roleKey: string,
  permissionKey: string,
): Promise<void> {
  // Upsert rather than insert: the grant is the desired end state, and a
  // double-click used to raise a primary key violation the user could do
  // nothing useful with.
  const { error } = await supabase
    .from('role_permissions')
    .upsert(
      { role_key: roleKey, permission_key: permissionKey },
      { onConflict: 'role_key,permission_key', ignoreDuplicates: true },
    )

  if (error) throw toAppError(error, 'Could not grant that permission.')
}

export async function revokePermission(
  roleKey: string,
  permissionKey: string,
): Promise<void> {
  const { error } = await supabase
    .from('role_permissions')
    .delete()
    .eq('role_key', roleKey)
    .eq('permission_key', permissionKey)

  if (error) throw toAppError(error, 'Could not revoke that permission.')
}

/* -------------------------------------------------------------------------- */
/* Position ↔ rank mapping                                                     */
/* -------------------------------------------------------------------------- */

/** Position ids a rank is restricted to. Empty means "offered for all". */
export async function getRankPositions(rankId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('position_ranks')
    .select('position_id')
    .eq('rank_id', rankId)

  if (error) throw toAppError(error, 'Could not load the rank mapping.')
  return (data ?? []).map((row) => row.position_id)
}

/**
 * Replaces a rank's position mapping.
 *
 * Delete-then-insert rather than a diff: the set is tiny, and doing it in one
 * predictable shape avoids a half-applied mapping if the insert fails.
 */
export async function setRankPositions(
  rankId: string,
  positionIds: string[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from('position_ranks')
    .delete()
    .eq('rank_id', rankId)

  if (deleteError) throw toAppError(deleteError, 'Could not update the rank mapping.')

  if (positionIds.length === 0) return

  const { error: insertError } = await supabase
    .from('position_ranks')
    .insert(positionIds.map((position_id) => ({ position_id, rank_id: rankId })))

  if (insertError) throw toAppError(insertError, 'Could not update the rank mapping.')
}
