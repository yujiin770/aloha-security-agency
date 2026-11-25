import { z } from 'zod'
import type {
  PdsDependent,
  PdsEmployment,
  PdsFields,
  PdsReference,
  PdsTraining,
} from '@/types/database.types'

/**
 * The agency's Personal Data Sheet (docs/APPLICATION (SECURITY).docx), beyond
 * the core application: family, emergency contact, education, trainings,
 * PNP/military service, dependents, employment, references and the yes/no
 * questions. Stored on both applicants and personnel (0032) and kept the same
 * on a hired guard's two records.
 *
 * Form values are strings throughout (booleans as 'yes' / 'no' / ''), so one
 * schema serves the public form and both staff dialogs.
 */

/** The form's sections, in the order the staff dialog shows them. */
export type PdsSection =
  | 'family'
  | 'emergency'
  | 'education'
  | 'military'
  | 'dependents'
  | 'employment'
  | 'references'
  | 'other'
  | 'ids'

export const ALL_PDS_SECTIONS: PdsSection[] = [
  'family',
  'emergency',
  'education',
  'military',
  'dependents',
  'employment',
  'references',
  'other',
  'ids',
]

/** Row limits — mirror the CHECK constraints in 0032. */
export const PDS_LIMITS = {
  trainings: 5,
  dependents: 10,
  employment_history: 5,
  character_references: 5,
} as const

export const PDS_TEXT_FIELDS = [
  'place_of_birth',
  'provincial_address',
  'religion',
  'father_name',
  'father_occupation',
  'mother_name',
  'mother_occupation',
  'parents_address',
  'spouse_name',
  'spouse_occupation',
  'spouse_address',
  'special_skills',
  'loan_details',
  'badge_no',
  'license_control_no',
  'res_cert_no',
  'res_cert_issued_on',
  'res_cert_issued_at',
  'emergency_contact_name',
  'emergency_contact_phone',
  'emergency_contact_relationship',
  'emergency_contact_occupation',
  'date_graduated',
  'school_name',
  'course',
  'military_branch',
  'military_serial_no',
  'military_rank',
  'military_status',
  'military_years_service',
  'military_reason_leaving',
  'recommended_by',
  'criminal_record_details',
  'health_problems',
] as const satisfies readonly (keyof PdsFields)[]

export const PDS_YES_NO_FIELDS = [
  'has_loans',
  'military_pnp',
  'military_afp',
  'military_rotc',
  'has_criminal_record',
  'drinks_alcohol',
  'smokes',
  'willing_background_check',
  'willing_any_assignment',
] as const satisfies readonly (keyof PdsFields)[]

export const PDS_LIST_FIELDS = [
  'trainings',
  'dependents',
  'employment_history',
  'character_references',
] as const satisfies readonly (keyof PdsFields)[]

/** Every column the Personal Data Sheet adds — for building patches. */
export type PdsTextField = (typeof PDS_TEXT_FIELDS)[number]
export type PdsYesNoField = (typeof PDS_YES_NO_FIELDS)[number]
export type PdsListField = (typeof PDS_LIST_FIELDS)[number]

const text = (max = 300) => z.string().trim().max(max, `At most ${max} characters`)
const yesNo = z.enum(['yes', 'no', ''])
const PHONE = /^[0-9+()\s-]{7,20}$/

const trainingSchema = z.object({ training: text(), school: text(), dates: text(100) })
const dependentSchema = z.object({
  name: text(),
  birth_date: z.string(),
  relationship: text(60),
  address: text(),
})
const employmentSchema = z.object({
  employer: text(),
  from: z.string(),
  to: z.string(),
  salary: text(40),
  reason: text(),
})
const referenceSchema = z.object({
  name: text(),
  company: text(),
  position: text(),
  contact: text(),
})

const textShape = Object.fromEntries(PDS_TEXT_FIELDS.map((k) => [k, text()])) as Record<
  PdsTextField,
  ReturnType<typeof text>
>
const yesNoShape = Object.fromEntries(PDS_YES_NO_FIELDS.map((k) => [k, yesNo])) as Record<
  PdsYesNoField,
  typeof yesNo
>

/** Every field optional: what staff use, and the base of the public form. */
export const pdsSchema = z.object({
  ...textShape,
  ...yesNoShape,
  emergency_contact_phone: z
    .string()
    .trim()
    .refine((v) => v === '' || PHONE.test(v), 'Enter a valid contact number'),
  military_years_service: z
    .string()
    .refine((v) => v === '' || (Number(v) >= 0 && Number(v) <= 60), 'Enter 0–60 years'),
  trainings: z.array(trainingSchema).max(PDS_LIMITS.trainings),
  dependents: z.array(dependentSchema).max(PDS_LIMITS.dependents),
  employment_history: z.array(employmentSchema).max(PDS_LIMITS.employment_history),
  character_references: z.array(referenceSchema).max(PDS_LIMITS.character_references),
})

export type PdsFormValues = z.infer<typeof pdsSchema>

const required = (message: string) => z.string().trim().min(1, message).max(300)

/**
 * The public form: place of birth, an emergency contact and one character
 * reference are required. Same rule as submit_application (0032). Field-level
 * rather than an object refinement, so each step's "Continue" checks its own.
 */
export const pdsApplySchema = pdsSchema.extend({
  place_of_birth: required('Place of birth is required'),
  emergency_contact_name: required('Emergency contact name is required'),
  emergency_contact_relationship: required('Relationship is required'),
  emergency_contact_phone: z
    .string()
    .trim()
    .min(1, 'Contact number is required')
    .regex(PHONE, 'Enter a valid contact number'),
  character_references: z
    .array(referenceSchema)
    .max(PDS_LIMITS.character_references)
    .refine(
      (rows) => rows.some((r) => r.name.trim() !== ''),
      'Add at least one character reference (a person not related to you)',
    ),
})

export const EMPTY_TRAINING: PdsTraining = { training: '', school: '', dates: '' }
export const EMPTY_DEPENDENT: PdsDependent = {
  name: '',
  birth_date: '',
  relationship: '',
  address: '',
}
export const EMPTY_EMPLOYMENT: PdsEmployment = {
  employer: '',
  from: '',
  to: '',
  salary: '',
  reason: '',
}
export const EMPTY_REFERENCE: PdsReference = { name: '', company: '', position: '', contact: '' }

export const pdsDefaults: PdsFormValues = {
  ...(Object.fromEntries(PDS_TEXT_FIELDS.map((k) => [k, ''])) as Record<PdsTextField, string>),
  ...(Object.fromEntries(PDS_YES_NO_FIELDS.map((k) => [k, ''])) as Record<
    PdsYesNoField,
    'yes' | 'no' | ''
  >),
  trainings: [],
  dependents: [],
  employment_history: [],
  character_references: [],
}

/** Rows typed by the user, with any null a stored row might carry made ''. */
function strings<T extends object>(rows: T[] | null | undefined, empty: T): T[] {
  return (rows ?? []).map((row) => {
    const out = { ...empty }
    for (const key of Object.keys(empty) as (keyof T)[]) {
      const value = (row as Record<keyof T, unknown>)[key]
      out[key] = (value === null || value === undefined ? '' : String(value)) as T[keyof T]
    }
    return out
  })
}

/** A stored record (applicant or personnel) as form values. */
export function pdsFromRow(row: PdsFields): PdsFormValues {
  const values = { ...pdsDefaults }
  for (const k of PDS_TEXT_FIELDS) {
    const v = row[k]
    values[k] = v === null || v === undefined ? '' : String(v)
  }
  for (const k of PDS_YES_NO_FIELDS) {
    const v = row[k]
    values[k] = v === true ? 'yes' : v === false ? 'no' : ''
  }
  values.trainings = strings(row.trainings, EMPTY_TRAINING)
  values.dependents = strings(row.dependents, EMPTY_DEPENDENT)
  values.employment_history = strings(row.employment_history, EMPTY_EMPLOYMENT)
  values.character_references = strings(row.character_references, EMPTY_REFERENCE)
  return values
}

/** Drops rows the user left completely blank and trims what remains. */
function cleanRows<T extends object>(rows: T[]): T[] {
  return rows
    .map((row) => {
      const out = { ...row }
      for (const key of Object.keys(out) as (keyof T)[]) {
        out[key] = String(out[key] ?? '').trim() as T[keyof T]
      }
      return out
    })
    .filter((row) => Object.values(row).some((v) => v !== ''))
}

/** Form values as the database columns — for an update, or the intake payload. */
export function pdsToPatch(values: PdsFormValues): Partial<PdsFields> {
  const patch: Record<string, unknown> = {}
  for (const k of PDS_TEXT_FIELDS) {
    const v = values[k]?.trim() ?? ''
    patch[k] = v === '' ? null : v
  }
  patch.military_years_service =
    values.military_years_service.trim() === '' ? null : Number(values.military_years_service)
  for (const k of PDS_YES_NO_FIELDS) {
    patch[k] = values[k] === 'yes' ? true : values[k] === 'no' ? false : null
  }
  patch.trainings = cleanRows(values.trainings)
  patch.dependents = cleanRows(values.dependents)
  patch.employment_history = cleanRows(values.employment_history)
  patch.character_references = cleanRows(values.character_references)
  return patch as Partial<PdsFields>
}
