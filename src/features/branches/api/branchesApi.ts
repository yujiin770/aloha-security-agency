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
 * Branch picker options.
 *
 * Branches are not readable by the anonymous role (RLS restricts SELECT to
 * staff), so a failure on the *public* application form is expected and
 * swallowed — "preferred branch" is optional and an applicant must never be
 * blocked by it.
 *
 * For a signed-in user it is not expected, and swallowing it there was a bug:
 * the Deployments and Applicants screens share this function, so any failure
 * showed up as a branch dropdown that was simply, silently empty — no error, no
 * retry, nothing to tell the user whether there were no branches or no answer.
 */
export async function listBranchOptions(): Promise<BranchOption[]> {
  const { data, error } = await supabase
    .from('branches')
    .select('id, code, name, city_municipality')
    .eq('is_active', true)
    .order('name')

  if (error) {
    const { data: session } = await supabase.auth.getSession()
    if (!session.session) return []
    throw toAppError(error, 'Could not load branches.')
  }

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
