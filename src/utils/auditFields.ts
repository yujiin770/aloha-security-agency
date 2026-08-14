import {
  applicantStatusMeta,
  deploymentStatusMeta,
  documentTypeMeta,
  employmentStatusMeta,
  shiftMeta,
} from '@/utils/constants'
import type { ToneName } from '@/utils/constants'
import { humanize } from '@/utils/format'

/**
 * How an audit log's captured columns are interpreted for display.
 *
 * The audit trigger stores `to_jsonb(new)` — the whole row, with database
 * column names and unresolved UUIDs. That is the right thing for it to store:
 * it must stay faithful to what was written, and it cannot know what a column
 * means. All of the meaning therefore lives here, and only affects display.
 */

/**
 * Only for labels `humanize()` gets wrong — acronyms it would title-case, and
 * columns whose database name is not what staff call the thing. Everything else
 * is deliberately left to `humanize()` so new columns need no maintenance here.
 */
const FIELD_LABELS: Record<string, string> = {
  sss_no: 'SSS Number',
  tin: 'TIN',
  tin_no: 'TIN',
  philhealth_no: 'PhilHealth Number',
  pagibig_no: 'Pag-IBIG Number',
  nbi_clearance_no: 'NBI Clearance Number',
  nbi_clearance_expiry: 'NBI Clearance Expiry',
  police_clearance_no: 'Police Clearance Number',
  security_license_no: 'Security Licence Number',
  security_license_expiry: 'Security Licence Expiry',
  reference_no: 'Reference Number',
  employee_no: 'Employee Number',
  branch_id: 'Facility',
  preferred_branch_id: 'Preferred Facility',
  position_id: 'Position',
  rank_id: 'Rank',
  personnel_id: 'Personnel',
  applicant_id: 'Applicant',
  coordinator_id: 'Coordinator',
  reviewed_by: 'Reviewed By',
  assigned_by: 'Assigned By',
  date_of_birth: 'Date of Birth',
  birth_date: 'Date of Birth',
  date_hired: 'Date Hired',
  date_separated: 'Date Separated',
  is_active: 'Active',
  is_licensed: 'Licensed',
  file_size: 'File Size',
  doc_type: 'Document Type',
  daily_rate: 'Daily Rate',
  monthly_rate: 'Monthly Rate',
  required_headcount: 'Required Headcount',
  submission_id: 'Submission Key',
}

/**
 * Internals that say nothing about what a person changed. `id` and the record's
 * own timestamps are already shown in the modal header, and search vectors are
 * derived. Hidden from the field list, still present in the raw JSON.
 */
export const HIDDEN_FIELDS = new Set([
  'id',
  'created_at',
  'updated_at',
  'search_vector',
  'fts',
  'tsv',
])

export const MASKED_FIELDS = new Set([
  'sss_no',
  'tin',
  'tin_no',
  'philhealth_no',
  'pagibig_no',
  'nbi_clearance_no',
  'police_clearance_no',
  'security_license_no',
])

export const CURRENCY_FIELDS = new Set([
  'daily_rate',
  'monthly_rate',
  'expected_salary',
  'salary',
  'rate',
  'amount',
])

export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
export const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** `night_shift`, `security_guard` — enum-shaped, safe to title-case. */
export const ENUM_SHAPED = /^[a-z0-9]+(_[a-z0-9]+)+$/

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? humanize(key)
}

/** Status columns whose value has a label and tone defined in constants.ts. */
export function statusBadge(
  table: string,
  key: string,
  value: string,
): { label: string; tone: ToneName } | null {
  if (key === 'shift') {
    const meta = shiftMeta(value as never)
    if (meta) return { label: meta.label, tone: meta.tone }
  }
  if (key === 'doc_type' || key === 'document_type') {
    const meta = documentTypeMeta(value as never)
    if (meta) return { label: meta.label, tone: meta.tone }
  }
  if (key === 'employment_status') {
    const meta = employmentStatusMeta(value as never)
    if (meta) return { label: meta.label, tone: meta.tone }
  }
  if (key === 'status') {
    // `status` means different things per table, so the table name picks the
    // vocabulary rather than guessing from the value.
    const meta =
      table === 'applicants'
        ? applicantStatusMeta(value as never)
        : table === 'deployments'
          ? deploymentStatusMeta(value as never)
          : undefined
    if (meta) return { label: meta.label, tone: meta.tone }
  }
  return null
}
