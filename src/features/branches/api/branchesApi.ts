import { supabase } from '@/lib/supabase'
import { toAppError } from '@/lib/errors'
import type { BranchRow, BranchStaffingView } from '@/types/database.types'

export interface BranchOption {
  id: string
  code: string
  name: string
  city_municipality: string
}

/**
 * Branch picker options for the public application form.
 *
 * Branches are not readable by the anonymous role (RLS restricts SELECT to
 * staff), so this falls back to an empty list rather than erroring — the
 * "preferred branch" field is optional, and an applicant should never be
 * blocked by it.
 */
export async function listBranchOptions(): Promise<BranchOption[]> {
  const { data, error } = await supabase
    .from('branches')
    .select('id, code, name, city_municipality')
    .eq('is_active', true)
    .order('name')

  if (error) return []
  return data ?? []
}

export async function listBranches(includeInactive = false): Promise<BranchRow[]> {
  let query = supabase.from('branches').select('*').order('code')
  if (!includeInactive) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) throw toAppError(error, 'Could not load branches.')
  return data ?? []
}

export async function getBranch(id: string): Promise<BranchRow> {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw toAppError(error, 'Could not load that branch.')
  return data
}

export async function listBranchStaffing(): Promise<BranchStaffingView[]> {
  const { data, error } = await supabase
    .from('v_branch_staffing')
    .select('*')
    .order('name')

  if (error) throw toAppError(error, 'Could not load branch staffing.')
  return data ?? []
}

export type BranchInput = Omit<
  BranchRow,
  'id' | 'created_at' | 'updated_at' | 'created_by'
>

export async function createBranch(input: BranchInput): Promise<BranchRow> {
  const { data, error } = await supabase
    .from('branches')
    .insert({ ...input, created_by: null })
    .select()
    .single()

  if (error) throw toAppError(error, 'Could not create that branch.')
  return data
}

export async function updateBranch(
  id: string,
  patch: Partial<BranchInput>,
): Promise<BranchRow> {
  const { data, error } = await supabase
    .from('branches')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw toAppError(error, 'Could not save that branch.')
  return data
}

export async function setBranchActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('branches')
    .update({ is_active: isActive })
    .eq('id', id)

  if (error) throw toAppError(error, 'Could not update that branch.')
}
