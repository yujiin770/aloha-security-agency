import type {
  ApplicantStatus,
  AppRole,
  CivilStatus,
  DeploymentStatus,
  DocumentType,
  EmploymentStatus,
  ShiftType,
  ToneToken,
} from '@/types/database.types'

/**
 * Display metadata for the database enums.
 *
 * Single source of truth for labels and status colours, so a badge in a table,
 * a filter dropdown and a chart legend can never disagree about what
 * "screening" looks like.
 */

/** Kept as an alias so existing component props continue to read naturally. */
export type ToneName = ToneToken

/** Selectable tones when configuring a position's badge colour. */
export const TONE_OPTIONS: { value: ToneToken; label: string }[] = [
  { value: 'brand', label: 'Red' },
  { value: 'laurel', label: 'Green' },
  { value: 'info', label: 'Blue' },
  { value: 'warning', label: 'Amber' },
  { value: 'success', label: 'Success green' },
  { value: 'danger', label: 'Danger red' },
  { value: 'neutral', label: 'Grey' },
]

interface EnumMeta<T extends string> {
  value: T
  label: string
  tone: ToneName
  description?: string
}

export const APPLICANT_STATUSES: EnumMeta<ApplicantStatus>[] = [
  { value: 'pending', label: 'Pending', tone: 'neutral', description: 'Newly submitted, awaiting first review' },
  { value: 'screening', label: 'Screening', tone: 'info', description: 'Documents and credentials under review' },
  { value: 'interview', label: 'Interview', tone: 'warning', description: 'Scheduled for or undergoing interview' },
  { value: 'hired', label: 'Hired', tone: 'success', description: 'Onboarded to the personnel roster' },
  { value: 'rejected', label: 'Rejected', tone: 'danger', description: 'Not proceeding' },
  { value: 'archived', label: 'Archived', tone: 'neutral', description: 'Closed and retained per policy' },
]

/**
 * Legal pipeline moves, mirroring validate_applicant_transition() in
 * migration 0007. The UI only offers what the database will accept — but the
 * database is the authority, not this table.
 */
export const APPLICANT_TRANSITIONS: Record<ApplicantStatus, ApplicantStatus[]> = {
  pending: ['screening', 'interview', 'rejected', 'archived'],
  screening: ['interview', 'rejected', 'pending', 'archived'],
  interview: ['hired', 'rejected', 'screening', 'archived'],
  hired: ['archived'],
  rejected: ['archived', 'pending'],
  archived: [],
}

// Positions and ranks are NOT listed here. Migration 0013 made them
// configuration rows, so they are loaded at runtime — see
// `src/features/config/hooks/useConfig.ts`. Re-adding a hardcoded list here
// would immediately drift from what a system administrator configured.

export const EMPLOYMENT_STATUSES: EnumMeta<EmploymentStatus>[] = [
  { value: 'active', label: 'Active', tone: 'success' },
  { value: 'on_leave', label: 'On Leave', tone: 'warning' },
  { value: 'suspended', label: 'Suspended', tone: 'danger' },
  { value: 'resigned', label: 'Resigned', tone: 'neutral' },
  { value: 'terminated', label: 'Terminated', tone: 'danger' },
]

export const DEPLOYMENT_STATUSES: EnumMeta<DeploymentStatus>[] = [
  { value: 'pending', label: 'Pending', tone: 'neutral' },
  { value: 'active', label: 'Active', tone: 'success' },
  { value: 'ended', label: 'Ended', tone: 'neutral' },
  { value: 'transferred', label: 'Transferred', tone: 'info' },
  { value: 'cancelled', label: 'Cancelled', tone: 'danger' },
]

export const SHIFTS: EnumMeta<ShiftType>[] = [
  { value: 'day', label: 'Day (06:00–18:00)', tone: 'warning' },
  { value: 'night', label: 'Night (18:00–06:00)', tone: 'info' },
  { value: 'mid', label: 'Mid (14:00–22:00)', tone: 'neutral' },
  { value: 'rotating', label: 'Rotating', tone: 'brand' },
]

export const DOCUMENT_TYPES: EnumMeta<DocumentType>[] = [
  { value: 'resume', label: 'Résumé / CV', tone: 'neutral' },
  { value: 'government_id', label: 'Government ID', tone: 'neutral' },
  { value: 'nbi_clearance', label: 'NBI Clearance', tone: 'neutral' },
  { value: 'police_clearance', label: 'Police Clearance', tone: 'neutral' },
  { value: 'barangay_clearance', label: 'Barangay Clearance', tone: 'neutral' },
  { value: 'medical_certificate', label: 'Medical Certificate', tone: 'neutral' },
  { value: 'training_certificate', label: 'Training Certificate', tone: 'neutral' },
  { value: 'security_license', label: 'Security Licence (LESP/SOSIA)', tone: 'neutral' },
  { value: 'diploma', label: 'Diploma / Transcript', tone: 'neutral' },
  { value: 'photo', label: 'ID Photo', tone: 'neutral' },
  { value: 'other', label: 'Other', tone: 'neutral' },
]

export const CIVIL_STATUSES: EnumMeta<CivilStatus>[] = [
  { value: 'single', label: 'Single', tone: 'neutral' },
  { value: 'married', label: 'Married', tone: 'neutral' },
  { value: 'widowed', label: 'Widowed', tone: 'neutral' },
  { value: 'separated', label: 'Separated', tone: 'neutral' },
  { value: 'divorced', label: 'Divorced', tone: 'neutral' },
]

// Role labels and descriptions are NOT listed here. They live in the `roles`
// table and are edited under Data Configuration → Roles, so a hardcoded copy
// would silently contradict whatever an administrator has set.

/**
 * Administrator-equivalent roles — the client-side mirror of `is_admin()` in
 * SQL (migration 0015).
 *
 * Every `<Can>` and `<RoleGuard>` that means "an administrator" spreads this
 * rather than listing roles inline, so widening the set again is one edit here
 * plus one migration, not a hunt through thirty files.
 */
export const ADMIN_ROLES = [
  'owner',
  'admin',
  'system_administrator',
] as const satisfies readonly AppRole[]

/** Which buckets accept which document types (mirrors 0010_storage.sql). */
export const DOCUMENT_BUCKETS: Record<DocumentType, string> = {
  resume: 'resumes',
  government_id: 'government-ids',
  nbi_clearance: 'government-ids',
  police_clearance: 'government-ids',
  barangay_clearance: 'government-ids',
  medical_certificate: 'certificates',
  training_certificate: 'certificates',
  security_license: 'certificates',
  diploma: 'certificates',
  photo: 'government-ids',
  other: 'certificates',
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 25

/** Lookup helpers — used by badges and table cells. */
function metaLookup<T extends string>(list: EnumMeta<T>[]) {
  const map = new Map(list.map((item) => [item.value, item]))
  return (value: T | null | undefined): EnumMeta<T> | undefined =>
    value ? map.get(value) : undefined
}

export const applicantStatusMeta = metaLookup(APPLICANT_STATUSES)
export const employmentStatusMeta = metaLookup(EMPLOYMENT_STATUSES)
export const deploymentStatusMeta = metaLookup(DEPLOYMENT_STATUSES)
export const shiftMeta = metaLookup(SHIFTS)
export const documentTypeMeta = metaLookup(DOCUMENT_TYPES)
