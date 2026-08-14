import { supabase } from '@/lib/supabase'
import { toAppError } from '@/lib/errors'
import type {
  ActiveDeploymentView,
  DeploymentHistoryRow,
  DeploymentRow,
  DeploymentStatus,
  ShiftType,
} from '@/types/database.types'
import type { Paginated } from '@/features/applicants/api/applicantsApi'

export interface DeploymentListParams {
  search?: string
  status?: DeploymentStatus | ''
  branchId?: string
  shift?: ShiftType | ''
  page: number
  pageSize: number
  sortColumn?: string
  sortDirection?: 'asc' | 'desc'
}

export async function listDeployments(
  params: DeploymentListParams,
): Promise<Paginated<ActiveDeploymentView>> {
  const {
    search,
    status,
    branchId,
    shift,
    page,
    pageSize,
    sortColumn = 'start_date',
    sortDirection = 'desc',
  } = params

  const from = (page - 1) * pageSize
  let query = supabase
    .from('v_active_deployments')
    .select('*', { count: 'exact' })
    .order(sortColumn, { ascending: sortDirection === 'asc' })
    .range(from, from + pageSize - 1)

  if (status) query = query.eq('status', status)
  if (branchId) query = query.eq('branch_id', branchId)
  if (shift) query = query.eq('shift', shift)
  if (search?.trim()) {
    const term = search.trim()
    query = query.or(
      `personnel_name.ilike.%${term}%,employee_no.ilike.%${term}%,branch_name.ilike.%${term}%`,
    )
  }

  const { data, error, count } = await query
  if (error) throw toAppError(error, 'Could not load deployments.')
  return { rows: data ?? [], total: count ?? 0 }
}

export interface CreateDeploymentInput {
  personnel_id: string
  branch_id: string
  shift: ShiftType
  start_date: string
  post_assignment?: string | null
  daily_rate?: number | null
  remarks?: string | null
}

/**
 * Creates a deployment.
 *
 * The `deployments_no_overlap` exclusion constraint (0005) rejects a guard who
 * already holds a pending/active assignment covering these dates — that error
 * is translated to plain language by `toAppError`.
 */
export async function createDeployment(
  input: CreateDeploymentInput,
): Promise<DeploymentRow> {
  const { data, error } = await supabase
    .from('deployments')
    .insert({
      personnel_id: input.personnel_id,
      branch_id: input.branch_id,
      shift: input.shift,
      start_date: input.start_date,
      post_assignment: input.post_assignment ?? null,
      daily_rate: input.daily_rate ?? null,
      remarks: input.remarks ?? null,
      end_date: null,
      status: 'active',
      ended_reason: null,
      assigned_by: null,
    })
    .select()
    .single()

  if (error) throw toAppError(error, 'Could not create that deployment.')
  return data
}

export async function updateDeployment(
  id: string,
  patch: Partial<DeploymentRow>,
): Promise<DeploymentRow> {
  const { data, error } = await supabase
    .from('deployments')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw toAppError(error, 'Could not save that deployment.')
  return data
}

/** Ends a deployment through the RPC, which re-checks the caller's role. */
export async function endDeployment(params: {
  id: string
  endDate: string
  reason?: string
}): Promise<DeploymentRow> {
  const { data, error } = await supabase.rpc('end_deployment', {
    p_deployment_id: params.id,
    p_end_date: params.endDate,
    ...(params.reason ? { p_reason: params.reason } : {}),
  })

  if (error) throw toAppError(error, 'Could not end that deployment.')
  return data
}

/**
 * Transfers a guard to another post. The RPC closes the old assignment the day
 * before the new one starts, which is what keeps the no-overlap constraint
 * satisfied across the handover.
 */
export async function transferDeployment(params: {
  id: string
  targetBranchId: string
  effectiveDate: string
  shift?: ShiftType
  reason?: string
}): Promise<DeploymentRow> {
  const { data, error } = await supabase.rpc('transfer_deployment', {
    p_deployment_id: params.id,
    p_target_branch: params.targetBranchId,
    p_effective_date: params.effectiveDate,
    ...(params.shift ? { p_shift: params.shift } : {}),
    ...(params.reason ? { p_reason: params.reason } : {}),
  })

  if (error) throw toAppError(error, 'Could not transfer that deployment.')
  return data
}

export async function getDeploymentHistory(
  id: string,
): Promise<DeploymentHistoryRow[]> {
  const { data, error } = await supabase
    .from('deployment_history')
    .select('*')
    .eq('deployment_id', id)
    .order('created_at', { ascending: false })

  if (error) throw toAppError(error, 'Could not load deployment history.')
  return data ?? []
}
