import { supabase } from '@/lib/supabase'
import { toAppError } from '@/lib/errors'
import type {
  DeploymentRow,
  EmploymentStatus,
  Json,
  PersonnelActionRow,
  PersonnelRosterView,
  PersonnelRow,
  ShiftType,
} from '@/types/database.types'
import type { Paginated } from '@/features/applicants/api/applicantsApi'

/**
 * An employment status, a flag that spans statuses — blocklisted (0027),
 * re-hired (0030) — or `employed`: everyone still with the agency (active, on
 * leave or suspended), which is what the roster opens on.
 */
export type RosterStatusFilter = EmploymentStatus | 'employed' | 'blocklisted' | 'rehired' | ''

/** Still with the agency: hired and not separated. */
export const EMPLOYED_STATUSES: EmploymentStatus[] = ['active', 'on_leave', 'suspended']

export interface PersonnelListParams {
  search?: string
  status?: RosterStatusFilter
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

  if (status === 'employed') query = query.in('employment_status', EMPLOYED_STATUSES)
  else if (status === 'blocklisted') query = query.eq('is_blocklisted', true)
  else if (status === 'rehired') query = query.eq('is_rehired', true)
  else if (status) query = query.eq('employment_status', status)
  if (branchId) query = query.eq('current_branch_id', branchId)
  // Commas and parentheses are PostgREST `or()` syntax; a term containing one
  // would split the filter and fail the request, so they are dropped.
  const term = search?.replace(/[,()]/g, ' ').trim()
  if (term) {
    query = query.or(
      `full_name.ilike.%${term}%,employee_no.ilike.%${term}%,security_license_no.ilike.%${term}%`,
    )
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

/** The roster record a hired applicant became, if any (and if visible to the caller). */
export async function getPersonnelForApplicant(
  applicantId: string,
): Promise<Pick<PersonnelRow, 'id' | 'employee_no' | 'employment_status'> | null> {
  const { data, error } = await supabase
    .from('personnel')
    .select('id, employee_no, employment_status')
    .eq('applicant_id', applicantId)
    .maybeSingle()

  if (error) throw toAppError(error, 'Could not load the personnel record.')
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
  | 'address'
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

/** Where the person is posted. Optional: they can be assigned later from Deployments. */
export interface FacilityInput {
  branchId: string
  shift: ShiftType
  post?: string | null
}

/**
 * Adds an already-employed guard straight to the roster, with no applicant
 * behind them. Hiring an applicant still goes through
 * promote_applicant_to_personnel(); this is for the people who were on the
 * payroll before the system was.
 *
 * Goes through the add_existing_personnel RPC (0028) so the person and their
 * facility (first deployment) are written in one transaction. Administrators
 * and HR only; the database enforces it.
 */
export async function createPersonnel(
  input: NewPersonnelInput,
  facility?: FacilityInput | null,
): Promise<PersonnelRow> {
  const { data, error } = await supabase.rpc('add_existing_personnel', {
    p_data: input as unknown as Json,
    p_branch_id: facility?.branchId ?? null,
    ...(facility ? { p_shift: facility.shift, p_post: facility.post ?? null } : {}),
  })

  // A duplicate employee number maps to its own sentence via
  // personnel_employee_no_unique in lib/errors.ts.
  if (error) throw toAppError(error, 'Could not add that personnel record.')
  return data as PersonnelRow
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
  /** The reason. Required by the database for a termination (0027). */
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

/* -------------------------------------------------------------------------- */
/* 0027 — violations, suspension, blocklist, re-hire                           */
/* -------------------------------------------------------------------------- */
// Every one of these goes through a SECURITY DEFINER RPC that requires a
// reason, records the effectivity date, and writes a `personnel_actions` row.
// Administrators and HR only; the database enforces it.

/** The violation and status-change log for one person, newest first. */
export async function listPersonnelActions(id: string): Promise<PersonnelActionRow[]> {
  const { data, error } = await supabase
    .from('personnel_actions')
    .select('*')
    .eq('personnel_id', id)
    .order('effective_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw toAppError(error, 'Could not load the disciplinary record.')
  return data ?? []
}

export async function recordViolation(params: {
  id: string
  offense: string
  reason: string
  date: string
}): Promise<PersonnelActionRow> {
  const { data, error } = await supabase.rpc('record_personnel_violation', {
    p_personnel_id: params.id,
    p_offense: params.offense,
    p_reason: params.reason,
    p_date: params.date,
  })
  if (error) throw toAppError(error, 'Could not record that violation.')
  return data as PersonnelActionRow
}

export async function suspendPersonnel(params: {
  id: string
  reason: string
  date: string
  until?: string | null
}): Promise<PersonnelRow> {
  const { data, error } = await supabase.rpc('suspend_personnel', {
    p_personnel_id: params.id,
    p_reason: params.reason,
    p_date: params.date,
    p_until: params.until || null,
  })
  if (error) throw toAppError(error, 'Could not record that suspension.')
  return data as PersonnelRow
}

export async function liftSuspension(params: {
  id: string
  reason: string
  date: string
}): Promise<PersonnelRow> {
  const { data, error } = await supabase.rpc('lift_personnel_suspension', {
    p_personnel_id: params.id,
    p_reason: params.reason,
    p_date: params.date,
  })
  if (error) throw toAppError(error, 'Could not lift that suspension.')
  return data as PersonnelRow
}

/** Removes the person from the company for good: no re-hire, no re-application. */
export async function blocklistPersonnel(params: {
  id: string
  reason: string
  date: string
}): Promise<PersonnelRow> {
  const { data, error } = await supabase.rpc('blocklist_personnel', {
    p_personnel_id: params.id,
    p_reason: params.reason,
    p_date: params.date,
  })
  if (error) throw toAppError(error, 'Could not blocklist that person.')
  return data as PersonnelRow
}

/** Brings a resigned (and not blocklisted) person back as active. */
export async function rehirePersonnel(params: {
  id: string
  reason: string
  date: string
}): Promise<PersonnelRow> {
  const { data, error } = await supabase.rpc('rehire_personnel', {
    p_personnel_id: params.id,
    p_reason: params.reason,
    p_date: params.date,
  })
  if (error) throw toAppError(error, 'Could not re-hire that person.')
  return data as PersonnelRow
}

/**
 * Imports one row of the personnel CSV/XLSX (0029): the person, their
 * facility, status and an optional violation, all or nothing. A failure leaves
 * nothing behind, so the row can be corrected and sent again.
 */
export async function importPersonnelRow(row: Record<string, string>): Promise<PersonnelRow> {
  const { data, error } = await supabase.rpc('import_personnel_row', { p_row: row as Json })
  if (error) throw toAppError(error, 'Could not import this row.')
  return data as PersonnelRow
}
