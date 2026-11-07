import { supabase } from '@/lib/supabase'
import { toAppError } from '@/lib/errors'
import type {
  DeploymentRow,
  EmploymentStatus,
  PersonnelRosterView,
  PersonnelRow,
} from '@/types/database.types'
import type { Paginated } from '@/features/applicants/api/applicantsApi'

export interface PersonnelListParams {
  search?: string
  status?: EmploymentStatus | ''
  /** A `positions.id`, not an enum value. */
  positionId?: string
  branchId?: string
  page: number
  pageSize: number
  sortColumn?: string
  sortDirection?: 'asc' | 'desc'
}

export async function listPersonnel(
  params: PersonnelListParams,
): Promise<Paginated<PersonnelRosterView>> {
  const {
    search,
    status,
    positionId,
    branchId,
    page,
    pageSize,
    sortColumn = 'full_name',
    sortDirection = 'asc',
  } = params

  const from = (page - 1) * pageSize
  let query = supabase
    .from('v_personnel_roster')
    .select('*', { count: 'exact' })
    .order(sortColumn, { ascending: sortDirection === 'asc' })
    .range(from, from + pageSize - 1)

  if (status) query = query.eq('employment_status', status)
  if (positionId) query = query.eq('position_id', positionId)
  if (branchId) query = query.eq('current_branch_id', branchId)
  if (search?.trim()) {
    const term = search.trim()
    query = query.or(`full_name.ilike.%${term}%,employee_no.ilike.%${term}%`)
  }

  const { data, error, count } = await query
  if (error) throw toAppError(error, 'Could not load the personnel roster.')
  return { rows: data ?? [], total: count ?? 0 }
}

export async function getPersonnel(id: string): Promise<PersonnelRow> {
  const { data, error } = await supabase
    .from('personnel')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw toAppError(error, 'Could not load that personnel record.')
  return data
}

export async function getPersonnelDeployments(id: string): Promise<DeploymentRow[]> {
  const { data, error } = await supabase
    .from('deployments')
    .select('*')
    .eq('personnel_id', id)
    .order('start_date', { ascending: false })

  if (error) throw toAppError(error, 'Could not load deployment history.')
  return data ?? []
}

/** Fields staff enter when adding a guard who was hired before the system existed. */
export type NewPersonnelInput = Pick<
  PersonnelRow,
  | 'first_name'
  | 'middle_name'
  | 'last_name'
  | 'suffix'
  | 'email'
  | 'phone'
  | 'birth_date'
  | 'sex'
  | 'position_id'
  | 'rank_id'
  | 'date_hired'
  | 'emergency_contact_name'
  | 'emergency_contact_phone'
  | 'sss_no'
  | 'philhealth_no'
  | 'pagibig_no'
  | 'tin_no'
  | 'security_license_no'
  | 'security_license_expiry'
> & {
  /** Their existing employee number, if they have one. Generated when omitted. */
  employee_no?: string | null
}

/**
 * Adds an already-employed guard straight to the roster, with no applicant
 * behind them. Hiring an applicant still goes through
 * promote_applicant_to_personnel(); this is for the people who were on the
 * payroll before the system was. RLS (personnel_insert) limits it to
 * administrators and HR.
 */
export async function createPersonnel(input: NewPersonnelInput): Promise<PersonnelRow> {
  const { employee_no, ...rest } = input
  const { data, error } = await supabase
    .from('personnel')
    .insert({
      ...rest,
      ...(employee_no?.trim() ? { employee_no: employee_no.trim() } : {}),
      email: rest.email?.trim().toLowerCase() || null,
      applicant_id: null,
      profile_id: null,
      date_separated: null,
      employment_status: 'active',
      photo_path: null,
      created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
    })
    .select()
    .single()

  // A duplicate employee number maps to its own sentence via
  // personnel_employee_no_unique in lib/errors.ts.
  if (error) throw toAppError(error, 'Could not add that personnel record.')
  return data
}

export async function updatePersonnel(
  id: string,
  patch: Partial<PersonnelRow>,
): Promise<PersonnelRow> {
  const { data, error } = await supabase
    .from('personnel')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw toAppError(error, 'Could not save that personnel record.')
  return data
}

/**
 * Records a resignation or termination.
 *
 * Goes through the `separate_personnel` RPC (0019) rather than a column update.
 * Separation has to close the person's open deployments in the same
 * transaction — a plain update left them `active`, so the facility carried on
 * counting a guard who had left, and the vacancy the agency needed to fill
 * never appeared. The RPC also satisfies the CHECK constraint on `personnel`
 * (0005) that ties employment_status and date_separated together.
 */
export async function separatePersonnel(params: {
  id: string
  status: Extract<EmploymentStatus, 'resigned' | 'terminated'>
  dateSeparated: string
  note?: string
}): Promise<PersonnelRow> {
  const { data, error } = await supabase.rpc('separate_personnel', {
    p_personnel_id: params.id,
    p_status: params.status,
    p_date: params.dateSeparated,
    p_note: params.note ?? null,
  })

  if (error) throw toAppError(error, 'Could not record that separation.')
  return data as PersonnelRow
}

/** Personnel available for a new posting — active and not currently deployed. */
export async function listAvailablePersonnel(): Promise<PersonnelRosterView[]> {
  const { data, error } = await supabase
    .from('v_personnel_roster')
    .select('*')
    .eq('employment_status', 'active')
    .is('current_deployment_id', null)
    .order('full_name')

  if (error) throw toAppError(error, 'Could not load available personnel.')
  return data ?? []
}
