import { supabase } from '@/lib/supabase'
import { toAppError } from '@/lib/errors'
import type {
  ActivityLogRow,
  AuditLogRow,
  DashboardStats,
  RecruitmentFunnelRow,
} from '@/types/database.types'
import type { Paginated } from '@/features/applicants/api/applicantsApi'

/** One round trip for every dashboard KPI tile — see get_dashboard_stats() in 0008. */
export async function fetchDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc('get_dashboard_stats')
  if (error) throw toAppError(error, 'Could not load dashboard statistics.')
  return data
}

export async function fetchRecruitmentFunnel(params: {
  from?: string
  to?: string
}): Promise<RecruitmentFunnelRow[]> {
  let query = supabase
    .from('mv_recruitment_funnel')
    .select('*')
    .order('period_month', { ascending: true })

  if (params.from) query = query.gte('period_month', params.from)
  if (params.to) query = query.lte('period_month', params.to)

  const { data, error } = await query
  if (error) throw toAppError(error, 'Could not load recruitment analytics.')
  return data ?? []
}

export async function refreshAnalytics(): Promise<void> {
  const { error } = await supabase.rpc('refresh_analytics')
  if (error) throw toAppError(error, 'Could not refresh analytics.')
}

/* -------------------------------------------------------------------------- */
/* Audit and activity                                                          */
/* -------------------------------------------------------------------------- */

export interface AuditListParams {
  tableName?: string
  action?: 'insert' | 'update' | 'delete' | ''
  actorId?: string
  from?: string
  to?: string
  page: number
  pageSize: number
}

export async function listAuditLogs(
  params: AuditListParams,
): Promise<Paginated<AuditLogRow>> {
  const { tableName, action, actorId, from, to, page, pageSize } = params
  const offset = (page - 1) * pageSize

  let query = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (tableName) query = query.eq('table_name', tableName)
  if (action) query = query.eq('action', action)
  if (actorId) query = query.eq('actor_id', actorId)
  if (from) query = query.gte('created_at', from)
  if (to) query = query.lte('created_at', to)

  const { data, error, count } = await query
  if (error) throw toAppError(error, 'Could not load the audit trail.')
  return { rows: data ?? [], total: count ?? 0 }
}

export async function listActivity(limit = 15): Promise<ActivityLogRow[]> {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw toAppError(error, 'Could not load recent activity.')
  return data ?? []
}

/* -------------------------------------------------------------------------- */
/* CSV export                                                                  */
/* -------------------------------------------------------------------------- */

/** UTF-8 byte-order mark, written as an escape so it stays visible in source. */
const BOM = '\uFEFF'

/**
 * Serialises rows to CSV and triggers a download.
 *
 * Fields beginning with `=`, `+`, `-` or `@` are prefixed with a single quote.
 * Without that, a value like `=cmd|'/c calc'!A1` in an applicant's name field
 * becomes a live formula when the file is opened in Excel — CSV injection is a
 * real path from user-supplied text to code execution on the reviewer's machine.
 */
export function downloadCsv(
  filename: string,
  rows: Record<string, unknown>[],
  columns?: { key: string; header: string }[],
): void {
  if (rows.length === 0) return

  const cols =
    columns ?? Object.keys(rows[0]!).map((key) => ({ key, header: key }))

  const escape = (value: unknown): string => {
    if (value == null) return ''
    let text = String(value)
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
    if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`
    return text
  }

  const csv = [
    cols.map((c) => escape(c.header)).join(','),
    ...rows.map((row) => cols.map((c) => escape(row[c.key])).join(',')),
  ].join('\r\n')

  // The BOM makes Excel read the file as UTF-8 rather than the system codepage,
  // so Filipino place names with accents survive the round trip. Written as an
  // escape rather than a literal so it stays visible in source.
  const blob = new Blob([BOM, csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
